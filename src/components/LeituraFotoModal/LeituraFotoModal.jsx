import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Camera as CameraIcon, X, CheckCircle, Share2, Settings, FileSpreadsheet, Upload, Trash2 } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { LeituraService } from '../../services/leituraService';
import { CameraService } from '../../services/cameraService';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { getUnidadesOffline } from '../../data/unidadesLocais';
import ModalGerenciarUnidades from '../ModalGerenciarUnidades/ModalGerenciarUnidades';
import PreviewFotoModal from '../PreviewFotoModal/PreviewFotoModal';
import { StorageService } from '../../services/storageService';
import { ImageStampService } from '../../services/imageStampService';
import { supabase } from '../../services/supabase';
import { Network } from '@capacitor/network';
import { salvarLeituraOffline } from '../../services/syncService';
import { sincronizarLeiturasNuvemParaLocal, rotacionarLeituraAnteriorLocal } from '../../services/leiturasAnterioresService';
import { enfileirarLeiturasAnteriores } from '../../services/syncOfflineService';
import { filesystemService } from '../../services/filesystemService';
import { UCondoImportService } from '../../services/ucondoImportService';
import { FilePickerService } from '../../services/filePickerService';
import { customConfirm, customConfirmDestrutivo, customAlert } from '../CustomPrompt/CustomPrompt';
import CustomCamera from '../CustomCamera/CustomCamera';
import './LeituraFotoModal.css';

// Helper de sanitização resiliente a acentos para nomes de diretórios/arquivos
const sanitizeName = (name) => {
  if (!name) return 'Desconhecido';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
};

const PROP_LEITURA_ANTERIOR = {
  agua: 'leitura_anterior',
  gas: 'leitura_anterior_gas',
  energia: 'leitura_anterior_energia',
};

const UnidadeCard = ({ apto, concluido, thumbnail, leituraAnterior, onLongPress, onClick }) => {
  const pressTimer = useRef(null);
  const pointerStartPos = useRef(null);
  const hasFiredRef = useRef(false);
  const [isPressed, setIsPressed] = useState(false);

  const clearLongPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    setIsPressed(false);
  };

  const startLongPress = (e) => {
    if (!concluido) return;
    
    pointerStartPos.current = { 
      x: e.clientX ?? (e.touches?.[0]?.clientX || 0), 
      y: e.clientY ?? (e.touches?.[0]?.clientY || 0) 
    };
    hasFiredRef.current = false;
    setIsPressed(true);
    
    if (navigator.vibrate) navigator.vibrate(50);
    
    pressTimer.current = setTimeout(() => {
      hasFiredRef.current = true;
      setIsPressed(false);
      if (navigator.vibrate) navigator.vibrate(100);
      onLongPress(apto);
    }, 800);
  };

  const handlePointerDown = (e) => startLongPress(e);

  const handlePointerMove = (e) => {
    if (!pointerStartPos.current) return;
    const clientX = e.clientX ?? (e.touches?.[0]?.clientX || 0);
    const clientY = e.clientY ?? (e.touches?.[0]?.clientY || 0);
    const diffX = Math.abs(clientX - pointerStartPos.current.x);
    const diffY = Math.abs(clientY - pointerStartPos.current.y);
    
    if (diffY > 10 || diffX > 10) {
      clearLongPressTimer();
      pointerStartPos.current = null;
    }
  };

  const handlePointerCancel = () => {
    clearLongPressTimer();
    pointerStartPos.current = null;
  };

  const handleClick = (e) => {
    if (hasFiredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      hasFiredRef.current = false;
      return;
    }
    onClick(apto, concluido);
  };

  const handleImageClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasFiredRef.current) {
      hasFiredRef.current = false;
      return;
    }
    onClick(apto, concluido);
  };

  return (
    <button
      id={`card-unidade-${apto}`}
      type="button"
      className={`btn-apto-simples ${concluido ? 'concluido' : ''}`}
      style={{ touchAction: 'pan-y' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      onTouchEnd={handlePointerCancel}
      onMouseUp={handlePointerCancel}
      onMouseLeave={handlePointerCancel}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <span className="apto-number">{apto}</span>
      {concluido ? (
        <div className="concluido-container">
          {thumbnail ? (
            <img 
              src={thumbnail} 
              alt="Preview" 
              className="unit-miniature" 
              style={{ opacity: isPressed ? 0.5 : 1, transition: 'opacity 0.2s' }}
              onClick={handleImageClick}
            />
          ) : (
            <div className="unit-sync-done-icon">
              <CheckCircle size={22} color="#16a34a" />
            </div>
          )}
          <div className="concluido-label">
            <CheckCircle size={12} />
            ✓ OK
          </div>
        </div>
      ) : (
        <div className="camera-placeholder" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CameraIcon size={20} />
          <span>Fotografar</span>
          {leituraAnterior !== undefined && (
            <span style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
              Ant: {leituraAnterior}
            </span>
          )}
        </div>
      )}
    </button>
  );
};

const LeituraFotoModal = ({ isOpen, onClose, leitura }) => {
  // 1. DECLARAÇÃO DE TODOS OS HOOKS NO TOPO ABSOLUTO
  const [fotosCapturadas, setFotosCapturadas] = useState({});
  const [concluidosMemoria, setConcluidosMemoria] = useState({});
  const [leiturasValores, setLeiturasValores] = useState({});
  const [exportando, setExportando] = useState(false);
  const [torreAtiva, setTorreAtiva] = useState(null);
  const [tipoMedicaoAtivo, setTipoMedicaoAtivo] = useState('agua');
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeApto, setActiveApto] = useState(null);
  const [unidadesCarregadas, setUnidadesAtualizadas] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [customCameraOpen, setCustomCameraOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [showModalLimpeza, setShowModalLimpeza] = useState(false);
  const [hydrationCounter, setHydrationCounter] = useState(0);
  const [previewSessionKey, setPreviewSessionKey] = useState(0);
  const toastTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  // NOVO: Estado e busca da leitura anterior (Offline-first)
  const [todasLeiturasAnteriores, setTodasLeiturasAnteriores] = useState({});

  useEffect(() => {
    if (isOpen && activeApto) {
      const modal = document.querySelector('.leitura-modal-overlay');
      if (modal) {
        modal.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    }
  }, [isOpen, activeApto]);

  // Listener para hidratar a tela caso a sincronização de background aconteça enquanto o modal está aberto
  useEffect(() => {
    const handleHydration = () => {
      setHydrationCounter(prev => prev + 1);
    };
    window.addEventListener('offline_cache_hydrated', handleHydration);
    return () => window.removeEventListener('offline_cache_hydrated', handleHydration);
  }, []);

  // Busca a leitura anterior APENAS do apartamento selecionado (offline-first fallback)
  useEffect(() => {
    if (isOpen && activeApto && leitura) {
      const fetchLeituraAnterior = async () => {
        let valueEncontrado = null;
        const apString = String(activeApto).trim();
        const condId = leitura?.id || leitura?.condominio_id;

        // 1. Tentar puxar do banco de dados (Supabase) se houver conexão
        try {
          const status = await Network.getStatus();
          if (status.connected && supabase && condId) {
            const colunaAlvo = PROP_LEITURA_ANTERIOR[tipoMedicaoAtivo] || 'leitura_anterior';
            
            const { data: undData, error: undErr } = await supabase
              .from('unidades')
              .select(colunaAlvo)
              .eq('condominio_id', condId)
              .eq('nome', apString)
              .limit(1)
              .single();
              
            if (!undErr && undData && undData[colunaAlvo] !== null && undData[colunaAlvo] !== undefined) {
               valueEncontrado = undData[colunaAlvo];
            }
          }
        } catch (e) {
          console.error("Erro ao buscar leitura_anterior no Supabase", e);
        }

        // 2. Fallback para o celular (localStorage)
        if (valueEncontrado === null) {
          try {
            const chaveStorage = `leituras_anteriores_${condId}`;
            const str = localStorage.getItem(chaveStorage);
            if (str) {
              const arr = JSON.parse(str);
              const obj = arr.find(l => String(l.unidade).trim() === apString);
              if (obj) {
                 const propCorreta = PROP_LEITURA_ANTERIOR[tipoMedicaoAtivo] || 'leitura_anterior';
                 if (obj[propCorreta] !== undefined && obj[propCorreta] !== null) {
                    valueEncontrado = obj[propCorreta];
                 }
              }
            }
          } catch(e) {
            console.error("Erro fallback local", e);
          }
        }

      };
      
      fetchLeituraAnterior();
    } else {
    }
  }, [isOpen, activeApto, leitura, tipoMedicaoAtivo]);

  // Busca TODAS as leituras anteriores para exibir no grid
  useEffect(() => {
    if (isOpen && leitura) {
      const condId = leitura?.id || leitura?.condominio_id;
      const chaveStorage = `leituras_anteriores_${condId}`;
      try {
        const str = localStorage.getItem(chaveStorage);
        if (str) {
          const arr = JSON.parse(str);
          const mapeado = {};
          arr.forEach(l => {
            const propCorreta = PROP_LEITURA_ANTERIOR[tipoMedicaoAtivo] || 'leitura_anterior';
            if (l[propCorreta] !== undefined && l[propCorreta] !== null) {
               mapeado[String(l.unidade).trim()] = l[propCorreta];
            }
          });
          setTodasLeiturasAnteriores(mapeado);
        } else {
          setTodasLeiturasAnteriores({});
        }
      } catch (e) {
        setTodasLeiturasAnteriores({});
      }
    }
  }, [isOpen, leitura, tipoMedicaoAtivo, isPreviewOpen, hydrationCounter]);

  const exibirToastSucesso = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setShowToast(true);
    toastTimeoutRef.current = setTimeout(() => {
      setShowToast(false);
      toastTimeoutRef.current = null;
    }, 2500);
  };

  const handleImportarPlanilhaRapida = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const condId = leitura?.id || leitura?.condominio_id;
      const buffer = await file.arrayBuffer();

      const novasUnidades = await UCondoImportService.atualizarUnidadesCondominio(
        condId,
        buffer,
        unidadesCarregadas,
        leitura?.nome || ''
      );

      if (novasUnidades && novasUnidades.length > 0) {
        setUnidadesAtualizadas(novasUnidades);
        
        // Salvar permanentemente no cache
        localStorage.setItem(`unidades_${condId}`, JSON.stringify(novasUnidades));
        try {
          await Filesystem.writeFile({
            path: `unidades_${condId}.json`,
            data: JSON.stringify(novasUnidades),
            directory: Directory.Data,
            encoding: Encoding.UTF8
          });
        } catch (e) {}

        await customAlert(`✅ ${novasUnidades.length} unidades atualizadas com sucesso a partir da planilha!`);
      }
    } catch (err) {
      await customAlert('Erro ao processar a planilha: ' + err.message);
    } finally {
      if (e.target) e.target.value = '';
      setIsProcessing(false);
    }
  };

  const dispararSeletorPlanilha = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const storageKey = useMemo(() => `unidades_${leitura?.id || 'default'}`, [leitura?.id]);

  useEffect(() => {
    if (isOpen && leitura) {
      const carregarDadosIniciais = async () => {
        try {
          // 1. Carregar status das fotos salvas no FS
          verificarFotosSalvas();

          const condId = leitura?.id || leitura?.condominio_id;
          // Restauração silenciosa: reconstrói a gaveta local se o app foi reinstalado
          sincronizarLeiturasNuvemParaLocal(condId).catch(() => {});

          let unidadesParaCarregar = [];

          // 2. Tentar carregar do Filesystem (Permanente)
          try {
            const fileName = `unidades_${condId}.json`;
            const fileResult = await Filesystem.readFile({
              path: fileName,
              directory: Directory.Data,
              encoding: Encoding.UTF8
            });
            if (fileResult.data) {
              unidadesParaCarregar = JSON.parse(fileResult.data);
            }
          } catch (fsError) {
          }

          // 3. Fallback para localStorage se FS falhar
          if (unidadesParaCarregar.length === 0) {
            const salvas = localStorage.getItem(`unidades_${condId}`);
            if (!salvas && storageKey) {
                const oldSalvas = localStorage.getItem(storageKey);
                if (oldSalvas) unidadesParaCarregar = JSON.parse(oldSalvas);
            } else if (salvas) {
              unidadesParaCarregar = JSON.parse(salvas);
            }
          }

          // 4. Se ainda vazio, tentar Supabase
          if (unidadesParaCarregar.length === 0 && supabase && condId) {
            const { data: unidadesData, error: supaErr } = await supabase
              .from('unidades')
              .select('*')
              .eq('condominio_id', condId);

            if (!supaErr && unidadesData && unidadesData.length > 0) {
              unidadesParaCarregar = unidadesData.map(u => u.numero || u.identificador || u.unidade);
            }
          }

          // 5. Último recurso: Lista offline padrão
          if (unidadesParaCarregar.length === 0) {
            const locais = getUnidadesOffline(leitura.nome);
            if (locais) {
              unidadesParaCarregar = locais;
            }
          }

          if (unidadesParaCarregar.length > 0) {
            setUnidadesAtualizadas(unidadesParaCarregar);
            
            // NOVO: Hidrata os dados oficiais do Supabase (leituras_detalhes) para as leituras_anteriores
            try {
              const { sincronizarLeiturasDoSupabase } = await import('../../services/leiturasAnterioresService');
              const unidadesHidratadas = await sincronizarLeiturasDoSupabase(leitura?.nome || condId, unidadesParaCarregar);
              
              const hidratadasValidas = unidadesHidratadas.filter(u => typeof u === 'object' && u.unidade);
              if (hidratadasValidas.length > 0) {
                localStorage.setItem(`leituras_anteriores_${condId}`, JSON.stringify(hidratadasValidas));
                // Dispara o evento para atualizar o grid (todasLeiturasAnteriores) instantaneamente
                window.dispatchEvent(new CustomEvent('offline_cache_hydrated', { detail: { condId } }));
              }
            } catch (err) {
              console.error("Falha ao hidratar histórico na inicialização:", err);
            }
            
            // Garantir que a lista esteja cacheada localmente
            localStorage.setItem(`unidades_${condId}`, JSON.stringify(unidadesParaCarregar));
            Filesystem.writeFile({
              path: `unidades_${condId}.json`,
              data: JSON.stringify(unidadesParaCarregar),
              directory: Directory.Data,
              encoding: Encoding.UTF8
            }).catch(() => {});
          } else {
            setUnidadesAtualizadas([]);
          }

          // Seleção dinâmica da aba com proteção de Race Condition:
          // Só define a aba ativa após ter certeza que a estrutura do condomínio está na memória local
          const tipoLeituraStr = String(leitura?.tipoLeitura || leitura?.tipo_leitura || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // limpa acentos
          
          let abaInicial = 'agua';

          if (tipoLeituraStr === 'somente gas' || tipoLeituraStr === 'gas') {
            abaInicial = 'gas';
          } else if (tipoLeituraStr === 'somente agua' || tipoLeituraStr === 'agua') {
            abaInicial = 'agua';
          } else {
            const temAguaDb = tipoLeituraStr.includes('agua');
            const temGasDb = tipoLeituraStr.includes('gas');
            const temEnergiaDb = tipoLeituraStr.includes('energia');

            const parseCheck = (key) => {
              try {
                const str = localStorage.getItem(key);
                if (!str) return false;
                const arr = JSON.parse(str);
                return Array.isArray(arr) && arr.length > 0;
              } catch(e) { return false; }
            };

            const temAguaPlanilha = parseCheck(`leituras_anteriores_${condId}_AGUA`);
            const temGasPlanilha = parseCheck(`leituras_anteriores_${condId}_GAS`);
            const temEnergiaPlanilha = parseCheck(`leituras_anteriores_${condId}_ENERGIA`);

            if (temAguaDb || temAguaPlanilha) {
              abaInicial = 'agua';
            } else if (temGasDb || temGasPlanilha) {
              abaInicial = 'gas';
            } else if (temEnergiaDb || temEnergiaPlanilha) {
              abaInicial = 'energia';
            }
          }
          
          setTipoMedicaoAtivo(abaInicial);
        } catch (error) {
        }
      };

      carregarDadosIniciais();
    }
  }, [isOpen, leitura, storageKey]);

  // Lógica de processamento de unidades e torres
  const { unidadesPorTorre, torres, listaCompleta } = useMemo(() => {
    const mapa = {};
    const listaUnidades = unidadesCarregadas.length > 0 ? unidadesCarregadas : (leitura?.unidades || []);

    listaUnidades.forEach(unidade => {
      try {
        const unidadeFormatada = String(unidade || '').trim();
        if (!unidadeFormatada) return;

        const match = unidadeFormatada.match(/^([A-Za-z0-9]+)-/);

        if (match) {
          const prefix = match[1];
          let label = '';
          if (/^\d+$/.test(prefix)) label = `Bloco ${prefix}`;
          else if (prefix.toUpperCase() === 'AP') label = 'Geral';
          else label = `Torre ${prefix}`;

          if (!mapa[label]) mapa[label] = [];
          mapa[label].push(unidadeFormatada);
        } else {
          if (!mapa['Geral']) mapa['Geral'] = [];
          mapa['Geral'].push(unidadeFormatada);
        }
      } catch (err) {
      }
    });

    const listaTorres = Object.keys(mapa).sort();
    let finalTorres = [...listaTorres];
    if (finalTorres.length > 1) finalTorres = ['Todas', ...finalTorres];
    else if (finalTorres.length === 1 && finalTorres[0] === 'Geral') finalTorres = ['Torre Única'];
    else if (finalTorres.length === 0) finalTorres = ['Torre Única'];

    return {
      unidadesPorTorre: mapa,
      torres: finalTorres,
      listaCompleta: listaUnidades.map(u => String(u || '').trim()).filter(Boolean)
    };
  }, [leitura, unidadesCarregadas]);

  useEffect(() => {
    if (torres.length > 0 && !torreAtiva) {
      setTorreAtiva(torres[0]);
    }
  }, [torres, torreAtiva]);

  // Filtro de exibição dinâmico
  const unidadesExibidas = useMemo(() => {
    if (torreAtiva === 'Todas' || torreAtiva === 'Torre Única' || !torreAtiva) {
      return listaCompleta;
    }
    return unidadesPorTorre[torreAtiva] || [];
  }, [torreAtiva, unidadesPorTorre, listaCompleta]);

  // Contador de conclusões (considera arquivo físico OU registro de conclusão persistente)
  const unidadesConcluidasCount = useMemo(() => {
    return unidadesExibidas.filter(apto => 
      Boolean(fotosCapturadas[apto]?.[tipoMedicaoAtivo] || concluidosMemoria[apto]?.[tipoMedicaoAtivo])
    ).length;
  }, [unidadesExibidas, fotosCapturadas, concluidosMemoria, tipoMedicaoAtivo]);

  // 2. FUNÇÕES AUXILIARES E HANDLERS
  const verificarFotosSalvas = async () => {
    if (!leitura?.id) return;
    try {
      
      const safeCondName = sanitizeName(leitura.nome);
      const pastaCondominio = `FastLeituras/${safeCondName}`;

      const capturadas = {};
      const valoresSalvos = {};

      // 1. LER DA NOVA PASTA (Organizada)
      try {
        const { files: pastaFiles } = await Filesystem.readdir({
          path: pastaCondominio,
          directory: Directory.Cache
        });

        for (const fileObj of pastaFiles) {
          const fileName = fileObj.name || fileObj;
          if (fileName.endsWith('.jpg')) {
            const match = fileName.match(/^Apto(.+)_([a-zA-Z]+)\.jpg$/);
            if (match) {
              const unidade = match[1];
              const servico = match[2].toLowerCase();
              const fullPath = `${pastaCondominio}/${fileName}`;
              
              const fileUriResult = await Filesystem.getUri({
                path: fullPath,
                directory: Directory.Cache
              });
              const webUrl = Capacitor.convertFileSrc(fileUriResult.uri);

              if (!capturadas[unidade]) capturadas[unidade] = {};
              capturadas[unidade][servico] = webUrl;
              
              const localVal = localStorage.getItem(`valor_${leitura.id}_${unidade}_${servico}`);
              if (localVal) {
                if (!valoresSalvos[unidade]) valoresSalvos[unidade] = {};
                valoresSalvos[unidade][servico] = localVal;
              }
            }
          }
        }
      } catch (err) {
      }

      // 2. LER DO PADRÃO ANTIGO (Fallback na Raiz)
      const filesAntigos = await StorageService.listFiles(`leitura_foto_${leitura.id}_`);
      for (const fileName of filesAntigos) {
        const partes = fileName.replace('.jpg', '').split('_');
        if (partes.length >= 6) {
          const unidade = partes[3];
          const servico = partes[4].toLowerCase();

          try {
            // Se já achou na nova pasta, ignora o antigo
            if (capturadas[unidade]?.[servico]) continue;

            const fileUriResult = await Filesystem.getUri({
              path: fileName,
              directory: Directory.Data
            });
            const webUrl = Capacitor.convertFileSrc(fileUriResult.uri);

            if (!capturadas[unidade]) capturadas[unidade] = {};
            capturadas[unidade][servico] = webUrl;

            const localVal = localStorage.getItem(`valor_${leitura.id}_${unidade}_${servico}`);
            if (localVal) {
              if (!valoresSalvos[unidade]) valoresSalvos[unidade] = {};
              valoresSalvos[unidade][servico] = localVal;
            }
          } catch (readErr) {
          }
        }
      }

      // Varre também todo o localStorage para garantir que qualquer valor salvo (mesmo sem foto física) seja carregado
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`valor_${leitura.id}_`)) {
            // Formato: valor_{leitura.id}_{unidadeId}_{tipoMedicao}
            const resto = key.replace(`valor_${leitura.id}_`, '');
            const lastUnderscore = resto.lastIndexOf('_');
            if (lastUnderscore !== -1) {
              const unidade = resto.substring(0, lastUnderscore);
              const servico = resto.substring(lastUnderscore + 1).toLowerCase();
              const val = localStorage.getItem(key);
              if (val) {
                if (!valoresSalvos[unidade]) valoresSalvos[unidade] = {};
                valoresSalvos[unidade][servico] = val;
              }
            }
          }
        }
      } catch (e) {
      }

      setFotosCapturadas(capturadas);
      setLeiturasValores(valoresSalvos);

      // Carrega a memória persistente de unidades concluídas salvas no localStorage
      const concluidosSalvos = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`concluido_${leitura.id}_`)) {
            // Formato: concluido_{leitura.id}_{unidadeId}_{tipoMedicao}
            const partes = key.replace(`concluido_${leitura.id}_`, '').split('_');
            if (partes.length >= 2) {
              const unidade = partes[0];
              const servico = partes[1].toLowerCase();
              if (!concluidosSalvos[unidade]) concluidosSalvos[unidade] = {};
              concluidosSalvos[unidade][servico] = true;
            }
          }
        }
      } catch (e) {
      }
      setConcluidosMemoria(concluidosSalvos);

    } catch (ignored) {
      setFotosCapturadas({});
      setLeiturasValores({});
      setConcluidosMemoria({});
    }
  };

  const handleUnitClick = (apto, concluido) => {
    setActiveApto(apto);
    // Decisão baseada no 'concluido' calculado no render, que já consolida
    // fotosCapturadas + concluidosMemoria — fonte da verdade mais confiável.
    if (concluido) {
      setIsPreviewOpen(true);
    } else {
      handleDispararCamera(apto);
    }
  };

  const handleExcluirFoto = async (overrideApto = null, skipConfirm = false) => {
    if (!skipConfirm) {
      if (!await customConfirmDestrutivo('Deseja realmente excluir esta foto e as evidências locais?', 'Excluir Foto')) return;
    }

    try {
      const unidadeId = String(overrideApto || activeApto).trim();
      // 1. CORREÇÃO CRÍTICA: Forçar maiúsculo para bater EXATAMENTE com o arquivo salvo no Android
      const tipoServico = tipoMedicaoAtivo.toUpperCase();

      const safeCondName = sanitizeName(leitura.nome);
      const pastaCondominio = `FastLeituras/${safeCondName}`;
      const newFileName = `Apto${unidadeId}_${tipoServico}.jpg`;
      const fullNewPath = `${pastaCondominio}/${newFileName}`;

      try {
        await Filesystem.deleteFile({
          path: fullNewPath,
          directory: Directory.Cache
        });
      } catch (e) {
        // Ignora se não existir
      }

      // 2. BUSCA ABRANGENTE NO FORMATO ANTIGO (Fallback)
      const filesAntigos = await StorageService.listFiles(`leitura_foto_${leitura.id}_${unidadeId}_`);
      for (const file of filesAntigos) {
        if (file.toLowerCase().includes(tipoServico.toLowerCase())) {
          await StorageService.deleteFile(file);
        }
      }

      // 3. Remove entradas órfãs do array localStorage['fila_sync_auto'] e ['leituras_pendentes']
      try {
        ['fila_sync_auto', 'leituras_pendentes'].forEach((key) => {
          const raw = localStorage.getItem(key);
          if (raw) {
            const filaAtual = JSON.parse(raw);
            if (Array.isArray(filaAtual) && filaAtual.length > 0) {
              const filaFiltrada = filaAtual.filter((item) => {
                const mesmaUnidade = String(item.unidade_id ?? '') === unidadeId || String(item.unidadeId ?? '') === unidadeId;
                const mesmoServico = (item.servico ?? item.tipoServico ?? '').toUpperCase() === tipoServico;
                return !(mesmaUnidade && mesmoServico);
              });
              localStorage.setItem(key, JSON.stringify(filaFiltrada));
            }
          }
        });
      } catch (storageErr) {
      }

      // 4. Tenta remover do Supabase (falha não bloqueia)
      if (supabase) {
        try {
          await supabase.from('leituras_detalhes').delete().match({
            unidade_id: unidadeId,
            servico: tipoServico,
          });
        } catch (supaErr) {
        }
      }

      // 5. Limpa variáveis de valor digitado e marcação de conclusão
      const servicoKey = tipoMedicaoAtivo.toLowerCase();
      localStorage.removeItem(`valor_${leitura.id}_${unidadeId}_${tipoMedicaoAtivo}`);
      localStorage.removeItem(`valor_${leitura.id}_${unidadeId}_${tipoServico}`);
      localStorage.removeItem(`concluido_${leitura.id}_${unidadeId}_${servicoKey}`);
      localStorage.removeItem(`concluido_${leitura.id}_${unidadeId}_${tipoServico}`);

      // 6. Atualiza a Tela (UI)
      setFotosCapturadas((prev) => {
        const novo = { ...prev };
        if (novo[unidadeId]) {
          delete novo[unidadeId][tipoMedicaoAtivo];
          if (Object.keys(novo[unidadeId]).length === 0) {
            delete novo[unidadeId];
          }
        }
        return novo;
      });

      setConcluidosMemoria((prev) => {
        const novo = { ...prev };
        if (novo[unidadeId]) {
          delete novo[unidadeId][servicoKey];
          delete novo[unidadeId][tipoServico];
          if (Object.keys(novo[unidadeId]).length === 0) {
            delete novo[unidadeId];
          }
        }
        return novo;
      });

      setLeiturasValores((prev) => {
        const novo = { ...prev };
        if (novo[unidadeId]) {
          delete novo[unidadeId][tipoMedicaoAtivo];
          if (Object.keys(novo[unidadeId]).length === 0) {
            delete novo[unidadeId];
          }
        }
        return novo;
      });

      setIsPreviewOpen(false);
      setActiveApto(null);
    } catch (err) {
      console.error('Erro ao excluir foto:', err);
      await customAlert('Ocorreu um erro ao excluir a foto. Tente novamente.');
    }
  };

  const limparCardUnidadeAposSalvar = async (unidadeId) => {
    const tipoServico = tipoMedicaoAtivo.toUpperCase();
    const servicoKey = tipoMedicaoAtivo.toLowerCase();

    localStorage.removeItem(`valor_${leitura.id}_${unidadeId}_${tipoMedicaoAtivo}`);
    localStorage.removeItem(`valor_${leitura.id}_${unidadeId}_${tipoServico}`);
    localStorage.removeItem(`concluido_${leitura.id}_${unidadeId}_${servicoKey}`);
    localStorage.removeItem(`concluido_${leitura.id}_${unidadeId}_${tipoServico}`);

    try {
      const safeCondName = sanitizeName(leitura.nome);
      const pastaCondominio = `FastLeituras/${safeCondName}`;
      const fileName = `Apto${unidadeId}_${tipoServico}.jpg`;
      await Filesystem.deleteFile({
        path: `${pastaCondominio}/${fileName}`,
        directory: Directory.Cache,
      });
    } catch {
      // Foto de preview pode já ter sido removida
    }

    // Zera URI/base64 da foto e valor do ciclo atual em memória
    setFotosCapturadas((prev) => {
      const novo = { ...prev };
      if (novo[unidadeId]) {
        novo[unidadeId] = { ...novo[unidadeId], [tipoMedicaoAtivo]: null };
        const temFotoRestante = Object.values(novo[unidadeId]).some((v) => v != null && v !== '');
        if (!temFotoRestante) delete novo[unidadeId];
      }
      return novo;
    });

    setConcluidosMemoria((prev) => {
      const novo = { ...prev };
      if (novo[unidadeId]) {
        delete novo[unidadeId][servicoKey];
        delete novo[unidadeId][tipoServico];
        if (Object.keys(novo[unidadeId]).length === 0) delete novo[unidadeId];
      }
      return novo;
    });

    setLeiturasValores((prev) => {
      const novo = { ...prev };
      if (novo[unidadeId]) {
        novo[unidadeId] = { ...novo[unidadeId], [tipoMedicaoAtivo]: null };
        const temValorRestante = Object.values(novo[unidadeId]).some((v) => v != null && v !== '');
        if (!temValorRestante) delete novo[unidadeId];
      }
      return novo;
    });

    setPreviewSessionKey((k) => k + 1);
  };

  const handleSaveReading = async (valor, fotoUrlOverride = null, fileNameOverride = null) => {
    try {
      const unidadeId = String(activeApto).trim();
      const fotoUrl = fotoUrlOverride || fotosCapturadas[unidadeId]?.[tipoMedicaoAtivo];

      if (!fotoUrl || fotoUrl.trim() === '') {
        await customAlert('Falha ao processar a foto. A imagem não foi anexada corretamente.');
        return;
      }

      if (!valor) {
        throw new Error('Valor da leitura ausente.');
      }

      const newFileName = `Apto${unidadeId}_${tipoMedicaoAtivo.toUpperCase()}.jpg`;

      let localFileName = fileNameOverride;

      // 1. BACKUP LOCAL TOLERANTE A FALHAS (Lote Offline - Organizado via filesystemService)
      // O bloco try/catch interno garante que uma falha no Filesystem não aborte o fluxo do leiturista.
      if (fotoUrl.startsWith('data:image/jpeg;base64,')) {
        try {
          localFileName = await filesystemService.salvarFotoCondominio(leitura.nome, localFileName || newFileName, fotoUrl);
        } catch (e) {
          console.warn('[handleSaveReading] Backup físico da foto falhou silenciosamente. O fluxo continua.', e);
        }
      }

      // Se o arquivo físico não pôde ser gerado (falha no FS ou foto não era base64),
      // usa o nome canônico como referência para o payload, sem abortar.
      if (!localFileName) {
        localFileName = newFileName;
      }

      const condId = leitura?.id || leitura?.condominio_id;
      const valorNumerico = parseFloat(String(valor).replace(',', '.'));

      // O salvamento diário não deve rotacionar a leitura anterior. A leitura anterior fica INTACTA.

      // Obtém usuário autenticado
      let activeUserId = 'cf720ead-721b-4aa5-b505-9a90ce9202d7';
      if (supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) activeUserId = user.id;
        } catch {
          // Mantém fallback seguro
        }
      }

      const payload = {
        condominio_id: condId,
        condominio_nome: leitura.nome,
        unidade_id: unidadeId,
        servico: tipoMedicaoAtivo.toUpperCase(),
        leitura_atual: valorNumerico,
        leiturista_id: activeUserId,
        data_leitura: new Date().toISOString(),
        fileName: localFileName
      };

      // OFFLINE-FIRST: enfileira leitura (foto) para sync sem bloquear a UI
      const enfileirado = await salvarLeituraOffline(payload, null, localFileName);
      if (!enfileirado) {
        throw new Error('Falha ao enfileirar leitura para sincronização offline.');
      }

      // Atualiza o estado para forçar o card a se manter preenchido com feedback visual
      setConcluidosMemoria(prev => ({
        ...prev,
        [unidadeId]: { ...(prev[unidadeId] || {}), [tipoMedicaoAtivo]: true }
      }));
      setLeiturasValores(prev => ({
        ...prev,
        [unidadeId]: { ...(prev[unidadeId] || {}), [tipoMedicaoAtivo]: valor },
        [`${unidadeId}_${tipoMedicaoAtivo}`]: valor // INJEÇÃO CRÍTICA PARA O VALIDADOR DE EXPORTAÇÃO
      }));
      // NOTA: 'limparCardUnidadeAposSalvar' removido intencionalmente para não perder o preview da foto.

      // NOVO: Atualiza a Leitura Atual imediatamente (UI State)
      setTodasLeiturasAnteriores(prev => {
        const oldValue = prev[unidadeId];
        const ant = (typeof oldValue === 'object' && oldValue !== null) ? oldValue.leitura_anterior : oldValue;
        return {
          ...prev,
          [unidadeId]: {
            ...(typeof oldValue === 'object' ? oldValue : {}),
            leitura_anterior: ant,
            leitura_atual: valorNumerico
          }
        };
      });

      // NOVO: Persiste no LocalStorage (Garantia de Sobreviv�ncia)
      try {
        const chaveStorage = `leituras_anteriores_${condId}`;
        const str = localStorage.getItem(chaveStorage);
        if (str) {
          const arr = JSON.parse(str);
          const idx = arr.findIndex(l => String(l.unidade).trim() === String(unidadeId));
          if (idx !== -1) {
             // ESTRITAMENTE salvar na chave leitura_atual, preservando a leitura_anterior
             arr[idx] = {
               ...arr[idx],
               leitura_atual: valorNumerico
             };
             localStorage.setItem(chaveStorage, JSON.stringify(arr));
          }
        }
      } catch(e) {
        console.error("Erro ao atualizar localStorage", e);
      }
      exibirToastSucesso();
      setIsPreviewOpen(false);
      setActiveApto(null);

    } catch (error) {
      await customAlert('❌ Erro inesperado ao salvar: ' + error.message);
      throw error;
    }
  };

  // Dispara a Câmera Nativa do Sistema Operacional (Sem recortes e sem PWA UI)
  const handleDispararCamera = async (aptoAlvo) => {
    const apto = aptoAlvo || activeApto;
    if (!apto || isProcessing) return;
    setActiveApto(apto);
    
    try {
      const photo = await Camera.getPhoto({
        quality: 30, // Compressão máxima para otimizar disco e banda (reduz a foto severamente)
        allowEditing: false, 
        resultType: CameraResultType.DataUrl, // <-- GARANTE BASE64 NO CAPACITOR
        source: CameraSource.Camera, // <-- FORÇA ABRIR O APLICATIVO NATIVO DE CÂMERA
        correctOrientation: true
      });
      
      // Passa a foto nativa convertida para a função de carimbar
      await handleCaptureAndSave(photo.dataUrl, null, apto);
    } catch (error) {
    }
  };

  // Novo fluxo All-in-One: Captura a foto e já recebe o valor digitado
  const handleCaptureAndSave = async (base64, valorLeitura, aptoOverride = null) => {
    // Isolamento cirúrgico de ID de unidade (Impede sobrescrever de outras)
    const apto = aptoOverride || activeApto;
    if (!apto) return;

    try {
      setIsProcessing(true);

      const unidadeId = String(apto).trim();
      const tipoServico = tipoMedicaoAtivo.toUpperCase();
      const servicoKey  = tipoMedicaoAtivo.toLowerCase();
      
      const safeCondName = sanitizeName(leitura.nome);
      const pastaCondominio = `FastLeituras/${safeCondName}`;
      const fileName = `Apto${unidadeId}_${tipoServico}.jpg`;

      // 1. Carimbo de dados via Canvas com Dupla Compressão
      const dadosUnidade = {
        nome: unidadeId,
        tipoLeitura: tipoServico,
        condominioNome: leitura.nome || 'Desconhecido'
      };
      
      const { fotoWhatsApp, fotoBanco } = await ImageStampService.carimbarFotoComDados(base64, dadosUnidade);

      // 2. Salva a FOTO WHATSAPP (pesada) no CACHE LOCAL para compartilhamento
      const savedFile = await CameraService.salvarFotoEmPasta(fotoWhatsApp, pastaCondominio, fileName);

      // 3. Limpeza de RAM imediata
      // (Variáveis de base64 agora saem de escopo naturalmente ao fechar a função)

      // 3. Sucesso parcial — fecha a câmera
      setCustomCameraOpen(false);

      // 4. Salva a FOTO BANCO (leve) apenas na Memória para a Interface
      // Isso exibe a miniatura, aguardando o usuário digitar o valor da leitura.
      setFotosCapturadas((prev) => ({
        ...prev,
        [unidadeId]: { ...(prev[unidadeId] || {}), [tipoMedicaoAtivo]: `data:image/jpeg;base64,${fotoBanco}` }
      }));

      // Abre automaticamente o modal de preview/digitação para a unidade capturada
      setIsPreviewOpen(true);

      // NÃO salva a leitura automaticamente nem a marca como concluída, 
      // para evitar o erro de "Valor da leitura ausente."

    } catch (error) {
      const errMsg = error?.message || JSON.stringify(error) || 'Erro desconhecido';
      await customAlert('⚠️ Erro ao processar a foto. Tente novamente.\n(Detalhe: ' + errMsg + ')');
      setCustomCameraOpen(true); // mantém câmera aberta para nova tentativa
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetakeFoto = async () => {
    try {
      const unidadeId = String(activeApto).trim();
      const tipoServico = tipoMedicaoAtivo.toUpperCase();
      const servicoKey = tipoMedicaoAtivo.toLowerCase();

      // 1. Deleta o arquivo físico novo
      const safeCondName = sanitizeName(leitura.nome);
      const pastaCondominio = `FastLeituras/${safeCondName}`;
      const newFileName = `Apto${unidadeId}_${tipoServico}.jpg`;
      try {
        await Filesystem.deleteFile({
          path: `${pastaCondominio}/${newFileName}`,
          directory: Directory.Cache
        });
      } catch (e) {}

      // 1.5. Deleta formato antigo se existir
      const prefixoChave = `leitura_foto_${leitura.id}_${unidadeId}_${tipoServico}`;
      const filesAntigos = await StorageService.listFiles(prefixoChave);
      for (const file of filesAntigos) {
        await StorageService.deleteFile(file);
      }

      // 2. Limpa da fila offline e localStorage
      try {
        ['fila_sync_auto', 'leituras_pendentes'].forEach((key) => {
          const raw = localStorage.getItem(key);
          if (raw) {
            const filaAtual = JSON.parse(raw);
            if (Array.isArray(filaAtual)) {
              const filaFiltrada = filaAtual.filter((item) => {
                const mesmaUnidade = String(item.unidade_id ?? '') === unidadeId;
                const mesmoServico = (item.servico ?? '').toUpperCase() === tipoServico;
                return !(mesmaUnidade && mesmoServico);
              });
              localStorage.setItem(key, JSON.stringify(filaFiltrada));
            }
          }
        });
      } catch (err) {
      }

      // 3. Limpa no Supabase se possível (sem travar a UI se offline)
      if (supabase) {
        try {
          await supabase.from('leituras_detalhes').delete().match({
            unidade_id: unidadeId,
            servico: tipoServico,
          });
        } catch (supaErr) {
        }
      }

      // 4. Limpa chaves e memórias
      localStorage.removeItem(`valor_${leitura.id}_${unidadeId}_${tipoMedicaoAtivo}`);
      localStorage.removeItem(`valor_${leitura.id}_${unidadeId}_${tipoServico}`);
      localStorage.removeItem(`concluido_${leitura.id}_${unidadeId}_${servicoKey}`);
      localStorage.removeItem(`concluido_${leitura.id}_${unidadeId}_${tipoServico}`);

      setFotosCapturadas((prev) => {
        const novo = { ...prev };
        if (novo[unidadeId]) {
          delete novo[unidadeId][tipoMedicaoAtivo];
          if (Object.keys(novo[unidadeId]).length === 0) delete novo[unidadeId];
        }
        return novo;
      });

      setConcluidosMemoria((prev) => {
        const novo = { ...prev };
        if (novo[unidadeId]) {
          delete novo[unidadeId][servicoKey];
          delete novo[unidadeId][tipoServico];
          if (Object.keys(novo[unidadeId]).length === 0) delete novo[unidadeId];
        }
        return novo;
      });

      setLeiturasValores((prev) => {
        const novo = { ...prev };
        if (novo[unidadeId]) {
          delete novo[unidadeId][tipoMedicaoAtivo];
        }
        return novo;
      });

      // 5. Fecha o preview e abre a câmera customizada in-app para nova captura
      setIsPreviewOpen(false);
      handleDispararCamera(unidadeId);
    } catch (err) {
      setIsPreviewOpen(false);
      handleDispararCamera(activeApto);
    }
  };

  // Reset do estado ativo/temporário das unidades do condomínio atual (encerramento do ciclo)
  const resetarEstadoLeiturasAtivas = async (condominioId) => {
    if (!condominioId) return;

    try {
      // 1. Limpa o estado ativo dos cards em memória
      setFotosCapturadas({});
      setConcluidosMemoria({});
      setLeiturasValores({});

      // 2. Limpa cache e chaves locais temporárias relacionadas ao ciclo ativo deste condomínio
      // (Preserva o banco de dados Supabase e registros sincronizados intactos)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          if (
            key.startsWith(`valor_${condominioId}_`) ||
            key.startsWith(`concluido_${condominioId}_`) ||
            key.startsWith(`temp_leituras_${condominioId}`) ||
            key.startsWith(`fotos_temp_${condominioId}`)
          ) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // 3. Remove arquivos temporários de fotos locais do ciclo
      try {
        const safeCondName = sanitizeName(leitura.nome);
        const pastaCondominio = `FastLeituras/${safeCondName}`;
        
        await Filesystem.rmdir({
          path: pastaCondominio,
          directory: Directory.Cache,
          recursive: true
        });
      } catch (fsErr) {
      }

      // 3.5. Limpa cache legado na raiz se existir
      try {
        const filesAntigos = await StorageService.listFiles(`leitura_foto_${condominioId}_`);
        for (const file of filesAntigos) {
          await StorageService.deleteFile(file);
        }
      } catch (fsErr) {}

    } catch (e) {
    }
  };

  const handleExportar = () => {
    // Análise Automática de Utilitários e Roteamento (Offline-First UX)
    const tipo = String(leitura?.tipoLeitura || leitura?.tipo_leitura || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (tipo.includes('somente agua') || tipo === 'agua') {
      executeExport('agua');
    } else if (tipo.includes('somente gas') || tipo === 'gas') {
      executeExport('gas');
    } else if (tipo.includes('energia')) {
      executeExport('energia');
    } else {
      // Caso Misto ou indefinido, abre o modal de opções
      setIsExportModalOpen(true);
    }
  };

  // FUNÇÃO MODULAR DE VALIDAÇÃO RIGOROSA ANTES DO ENVIO
  const validarLeiturasLote = (scopeParam, tipoCondominioOrig, unidadesList, leiturasVal) => {
    const tipo = String(tipoCondominioOrig || '').toLowerCase();
    const isMisto = !tipo.includes('somente') && !tipo.includes('energia');

    let servicosParaValidar = [];
    if (scopeParam === 'todos') {
      if (isMisto) servicosParaValidar = ['agua', 'gas'];
      else if (tipo.includes('agua')) servicosParaValidar = ['agua'];
      else if (tipo.includes('gas')) servicosParaValidar = ['gas'];
      else if (tipo.includes('energia')) servicosParaValidar = ['energia'];
    } else {
      servicosParaValidar = [scopeParam];
    }

    for (const uni of unidadesList) {
      const apStr = String(uni.unidade || uni.nome || uni).trim();
      for (const srv of servicosParaValidar) {

        // Checa se o usuário tirou foto ou interagiu com este apartamento
        const statusFoto = fotosCapturadas[apStr] || {};
        const statusConcluido = concluidosMemoria[apStr] || {};
        const hasInteraction = statusFoto[srv] || statusConcluido[srv] || leiturasVal[apStr]?.[srv] !== undefined;

        // Se não mexeu no apartamento, pula a validação dele (permite lote parcial)
        if (!hasInteraction) continue;

        // Se interagiu, verifica se a leitura é válida e maior que zero
        const val = leiturasVal[`${apStr}_${srv}`] ?? leiturasVal[apStr]?.[srv];
        let numVal = NaN;
        if (val !== undefined && val !== null && val !== '') {
          const valLimpo = String(val).replace(/\./g, '').replace(',', '.').trim();
          numVal = Number(valLimpo);
        }

        if (val === undefined || val === null || val === '' || numVal === 0 || Number.isNaN(numVal)) {
          return { isValid: false, unidade: apStr, servico: srv };
        }
      }
    }
    return { isValid: true };
  };

  const executeExport = async (scope) => {
    setIsExportModalOpen(false);

    // Suporta 'agua', 'gas', 'energia', 'todos' ou faz fallback para a aba ativa
    const servico = (scope && ['agua', 'gas', 'energia', 'todos'].includes(scope)) 
      ? scope 
      : tipoMedicaoAtivo;

    // VALIDAÇÃO RIGOROSA ANTES DO ENVIO
    const validacao = validarLeiturasLote(
      servico, 
      leitura?.tipoLeitura || leitura?.tipo_leitura, 
      unidadesCarregadas, 
      leiturasValores,
      fotosCapturadas,
      concluidosMemoria
    );
    if (!validacao.isValid) {
      const msg = `A leitura de ${validacao.servico.toUpperCase()} da unidade ${validacao.unidade} não possui foto ou não foi preenchida.`;
      
      // Usa o customAlert para esperar o clique do "OK"
      await customAlert(msg, 'Leitura Pendente');
      
      setTimeout(() => {
        const cardErro = document.getElementById(`card-unidade-${validacao.unidade}`);
        if (cardErro) {
          cardErro.scrollIntoView({ behavior: 'smooth', block: 'center' });
          cardErro.classList.add('highlight-pulse');
          setTimeout(() => cardErro.classList.remove('highlight-pulse'), 3000);
        }
      }, 300);
      return; // Interrompe o fluxo imediatamente
    }
    
    // 1. Confirmação Elegante de Envio
    const nomeAmigavel = servico === 'todos' ? 'Consolidado (Todos)' : servico.toUpperCase();
    
    const mensagemConfirmacao = `Confirmar envio de ${nomeAmigavel}? Esta ação enviará os dados para o WhatsApp.`;
    
    const isConfirmed = await customConfirm(
      mensagemConfirmacao, 
      'Confirmação de Envio'
    );

    if (!isConfirmed) return;

    setExportando(true);

    try {
      // 1. Sincronização Cirúrgica de Histórico no Supabase (Unidades Leituras)
      const condId = leitura?.id || leitura?.condominio_id;
      if (condId && supabase) {
        try {
          const storageAnterior = localStorage.getItem(`leituras_anteriores_${condId}`);
          let listaDeUnidades = [];
          if (storageAnterior) {
            listaDeUnidades = JSON.parse(storageAnterior);
          } else {
            listaDeUnidades = unidadesCarregadas.map(u => ({
              unidade: String(u.unidade || u.nome || u).trim(),
              leitura_anterior: 0,
              leitura_anterior_gas: 0
            }));
          }

          const payloadLote = [];
          const cacheAtualizado = [];

          listaDeUnidades.forEach(unidade => {
            const apString = String(unidade.unidade).trim();
            const valAtualAgua = leiturasValores[`${apString}_agua`];
            const valAtualGas = leiturasValores[`${apString}_gas`];
            
            const parseValorLeituraLocal = (val) => {
              if (val === null || val === undefined || val === '') return null;
              const limpo = String(val).replace(/\./g, '').replace(',', '.').trim();
              const num = parseFloat(limpo);
              return isNaN(num) ? null : num;
            };
            
            const pAgua = parseValorLeituraLocal(valAtualAgua);
            const novaLeituraAnterior = (pAgua !== null) 
              ? pAgua 
              : unidade.leitura_anterior;

            const pGas = parseValorLeituraLocal(valAtualGas);
            const novaLeituraAnteriorGas = (pGas !== null) 
              ? pGas 
              : unidade.leitura_anterior_gas;

            payloadLote.push({
              condominio_id: condId,
              unidade: apString,
              leitura_anterior: novaLeituraAnterior,
              leitura_anterior_gas: novaLeituraAnteriorGas,
              updated_at: new Date().toISOString()
            });

            cacheAtualizado.push({
              ...unidade,
              leitura_anterior: novaLeituraAnterior,
              leitura_anterior_gas: novaLeituraAnteriorGas
            });
          });

          if (payloadLote.length > 0) {
            const { error: upsertErr } = await supabase
              .from('unidades_leituras')
              .upsert(payloadLote, { onConflict: 'condominio_id,unidade' });
              
            if (upsertErr) {
              console.error("Erro ao sincronizar leituras com o Supabase:", upsertErr);
            } else {
              // Atualização do Cache Local (LocalStorage) imediatamente após o sucesso
              localStorage.setItem(`leituras_anteriores_${condId}`, JSON.stringify(cacheAtualizado));
            }
          }
        } catch (errSyncHist) {
          console.error("Falha ao salvar histórico no Supabase:", errSyncHist);
        }
      }

      // 2. Exportação para WhatsApp
      const sucesso = await LeituraService.exportarParaWhatsApp(
        leitura,
        servico,
        listaCompleta,
        leiturasValores
      );

      if (sucesso) {
        // Feedback de conclusão sem fechar o modal nem apagar os cards!
        exibirToastSucesso();
      }
    } catch (err) {
      await customAlert('Ocorreu um erro ao salvar as leituras. Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  const handleLimparMes = async () => {
    setIsExportModalOpen(false);

    const isConfirmed = await customConfirmDestrutivo(
      'Deseja realmente finalizar o mês e LIMPAR todas as leituras da tela deste condomínio? Esta ação o preparará para o próximo ciclo.',
      'Limpar Condomínio',
      'Limpar Tudo'
    );

    if (!isConfirmed) return;

    const condId = leitura?.id || leitura?.condominio_id;
    try {
      await resetarEstadoLeiturasAtivas(condId);
      await customAlert('Condomínio limpo e finalizado com sucesso! Pronto para o próximo mês.');
      onClose();
    } catch (err) {
      await customAlert('Erro ao limpar condomínio: ' + err.message);
    }
  };

  const executarLimpezaFotosUI = async () => {
    const condId = leitura?.id || leitura?.condominio_id;
    
    if (condId) {
      // 1. Atualiza o histórico (Virada de Mês)
      try {
        const storageAnterior = localStorage.getItem(`leituras_anteriores_${condId}`);
        let listaDeUnidades = [];
        if (storageAnterior) {
          listaDeUnidades = JSON.parse(storageAnterior);
        } else {
          // Fallback: se não tiver histórico, cria baseado nas unidades renderizadas
          listaDeUnidades = unidadesCarregadas.map(u => ({
            unidade: String(u.unidade || u.nome || u).trim(),
            leitura_anterior: 0,
            leitura_anterior_gas: 0
          }));
        }

        const unidadesAtualizadas = listaDeUnidades.map(unidade => {
          const apString = String(unidade.unidade).trim();
          
          // Extrai o valor atual do estado correto do React (garantindo que o consumo seja calculado via nova leitura anterior)
          const valAtualAgua = leiturasValores[apString]?.agua;
          const valAtualGas = leiturasValores[apString]?.gas;
          
          const parseValorLeituraLocal = (val) => {
            if (val === null || val === undefined || val === '') return null;
            const limpo = String(val).replace(/\./g, '').replace(',', '.').trim();
            const num = parseFloat(limpo);
            return isNaN(num) ? null : num;
          };
          
          // 1. O valor atual digitado embaixo vira a nova leitura anterior em cima
          const pAgua = parseValorLeituraLocal(valAtualAgua);
          const novaLeituraAnterior = (pAgua !== null) 
            ? pAgua 
            : unidade.leitura_anterior;

          const pGas = parseValorLeituraLocal(valAtualGas);
          const novaLeituraAnteriorGas = (pGas !== null) 
            ? pGas 
            : unidade.leitura_anterior_gas;

          return {
            ...unidade,
            // Limpa as fotos da tela
            foto: null, 
            foto_gas: null, 
            
            // Passa o bastão: o atual vira o anterior oficial do ciclo
            leitura_anterior: novaLeituraAnterior,
            leitura_anterior_gas: novaLeituraAnteriorGas,
            
            // Zera os inputs atuais para a nova coleta do mês seguinte
            leitura: '',
            leitura_gas: ''
          };
        });

        // O cache local recebe as unidadesAtualizadas com o histórico renovado
        localStorage.setItem(`leituras_anteriores_${condId}`, JSON.stringify(unidadesAtualizadas));
        
        // Sincronização Obrigatória (Supabase): Envia payload de UPDATE para a fila do syncOfflineService
        const payloadAgua = unidadesAtualizadas.map(u => ({
          unidade: u.unidade,
          leitura_anterior: u.leitura_anterior
        }));
        const payloadGas = unidadesAtualizadas.map(u => ({
          unidade: u.unidade,
          leitura_anterior: u.leitura_anterior_gas
        }));
        
        enfileirarLeiturasAnteriores(condId, payloadAgua, 'AGUA');
        enfileirarLeiturasAnteriores(condId, payloadGas, 'GAS');
        
        // Dispara evento global para forçar re-render nas camadas do App que observam esse cache offline
        window.dispatchEvent(new CustomEvent('offline_cache_hydrated', { detail: { condId } }));
      } catch (e) {
        console.error('Erro ao atualizar histórico de leituras:', e);
      }

      // 2. Remove as chaves de conclusão locais para a tela permanecer limpa no próximo load
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`concluido_${condId}_`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      // 3. "Arquiva" a pasta física renomeando-a para preservar as fotos no celular sem exibi-las na UI
      try {
        const safeCondName = sanitizeName(leitura.nome);
        const pastaCondominio = `FastLeituras/${safeCondName}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await Filesystem.rename({
          from: pastaCondominio,
          to: `${pastaCondominio}_archived_${timestamp}`,
          directory: Directory.Cache
        });
      } catch (e) {
        // Se a pasta não existir ou não puder ser renomeada, ignoramos silenciosamente
      }
    }

    // 4. Limpa apenas as referências de foto e zera os inputs no estado visual atual
    setFotosCapturadas({});
    setConcluidosMemoria({});
    setLeiturasValores({}); // IMPORTANTE: zera os inputs atuais na interface!
    
    setShowModalLimpeza(false); // Fecha o modal após o sucesso
  };


  // 3. TRAVA DE SEGURANÇA (APÓS TODOS OS HOOKS)
  if (!isOpen || !leitura) return null;

  const tipoCondominioStr = String(leitura?.tipoLeitura || leitura?.tipo_leitura || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const showAgua = tipoCondominioStr.includes('agua') || tipoCondominioStr === '';
  const showGas = tipoCondominioStr.includes('gas') || tipoCondominioStr === '';
  const showEnergia = tipoCondominioStr.includes('energia');

  return (
    <>
      {/* 1. Modal de seleção das unidades do condomínio */}
      {!customCameraOpen && (
        <div className="foto-modal-overlay" onClick={onClose}>
          <div className="foto-modal-container" onClick={(e) => e.stopPropagation()}>
            <header className="foto-modal-header">
              <div className="foto-modal-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3>{leitura.nome}</h3>
                  <button
                    type="button"
                    className="btn-settings-units"
                    onClick={dispararSeletorPlanilha}
                    title="Importar / Atualizar Planilha uCondo"
                    style={{ color: '#0284c7' }}
                  >
                    <FileSpreadsheet size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn-settings-units"
                    onClick={() => setIsManageModalOpen(true)}
                    title="Configuração Manual de Unidades"
                  >
                    <Settings size={18} />
                  </button>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModalLimpeza(true);
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', marginLeft: '8px', cursor: 'pointer' }}
                  >
                    <Trash2 size={26} color="#ef4444" />
                  </div>
                </div>
                <p>Selecione a unidade para fotografar</p>
              </div>
              <button type="button" className="btn-close-modal" onClick={onClose}>
                <X size={20} />
              </button>
            </header>

            {/* Input invisível para seleção nativa rápida de planilha */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleImportarPlanilhaRapida}
            />

            <div className="modal-selectors">
              <div className="selectors-top-row">
                <div className="torre-filter-wrapper-select">
                  <select
                    className="select-torre-ap"
                    value={torreAtiva || ''}
                    onChange={(e) => setTorreAtiva(e.target.value)}
                  >
                    {torres.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="medicao-toggle-group-expand">
                  {showAgua && (
                    <button
                      type="button"
                      className={`btn-medicao-toggle ${tipoMedicaoAtivo === 'agua' ? 'active-agua' : ''}`}
                      onClick={() => setTipoMedicaoAtivo('agua')}
                    >
                      ÁGUA
                    </button>
                  )}
                  {showGas && (
                    <button
                      type="button"
                      className={`btn-medicao-toggle ${tipoMedicaoAtivo === 'gas' ? 'active-gas' : ''}`}
                      onClick={() => setTipoMedicaoAtivo('gas')}
                    >
                      GÁS
                    </button>
                  )}
                  {showEnergia && (
                    <button
                      type="button"
                      className={`btn-medicao-toggle ${tipoMedicaoAtivo === 'energia' ? 'active-energia' : ''}`}
                      onClick={() => setTipoMedicaoAtivo('energia')}
                    >
                      ENERGIA
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="foto-modal-body">
              {unidadesCarregadas.length === 0 && (
                <div className="no-units-notice">
                  <p>Nenhuma unidade cadastrada para este condomínio.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '280px', margin: '0 auto' }}>
                    <button 
                      type="button" 
                      onClick={dispararSeletorPlanilha}
                      style={{
                        background: '#0284c7',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontWeight: '600'
                      }}
                    >
                      <FileSpreadsheet size={18} />
                      Importar Planilha uCondo
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setIsManageModalOpen(true)}
                      style={{
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <Settings size={16} />
                      Configurar Manualmente
                    </button>
                  </div>
                </div>
              )}
              <div className="apartamentos-grid">
                {[...unidadesExibidas]
                  .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }))
                  .map((apto) => {
                  const status = fotosCapturadas[apto] || {};
                  const thumbnail = status[tipoMedicaoAtivo];
                  const concluido = Boolean(thumbnail || concluidosMemoria[apto]?.[tipoMedicaoAtivo]);

                  return (
                    <UnidadeCard
                      key={apto}
                      apto={apto}
                      concluido={concluido}
                      thumbnail={thumbnail}
                      leituraAnterior={(typeof todasLeiturasAnteriores[apto] === 'object' && todasLeiturasAnteriores[apto] !== null) ? todasLeiturasAnteriores[apto].leitura_anterior : todasLeiturasAnteriores[apto]}
                      onClick={handleUnitClick}
                      onLongPress={async (aptoAlvo) => {
                        const isConfirmed = await customConfirmDestrutivo(
                          'Deseja realmente excluir esta foto?',
                          'Excluir Foto'
                        );
                        if (isConfirmed) {
                          handleExcluirFoto(aptoAlvo, true);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <footer className="foto-modal-footer">
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-exportar-csv"
                  onClick={handleExportar}
                  disabled={exportando || unidadesConcluidasCount === 0}
                >
                  <Upload size={18} />
                  {exportando ? 'Processando...' : `Salvar Leituras (${unidadesConcluidasCount}/${unidadesExibidas.length})`}
                </button>
                <button type="button" className="btn-cancelar-foto" onClick={onClose}>
                  Fechar
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* 2. Modal de Gerenciamento de Unidades */}
      <ModalGerenciarUnidades
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        condominioId={leitura.id}
        condominioNome={leitura.nome}
        onUnidadesAtualizadas={(novas) => setUnidadesAtualizadas(novas)}
      />

      {/* 3. Modal de Revisão da Foto e Lançamento de Leitura */}
      <PreviewFotoModal
        key={`preview-${activeApto}-${tipoMedicaoAtivo}-${previewSessionKey}`}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        imageUri={fotosCapturadas[activeApto]?.[tipoMedicaoAtivo] || ''}
        unitInfo={`${activeApto} - ${tipoMedicaoAtivo.toUpperCase()}`}
        onRetake={handleRetakeFoto}
        onSaveReading={handleSaveReading}
        initialValue={leiturasValores[activeApto]?.[tipoMedicaoAtivo] || ''}
        leituras={todasLeiturasAnteriores}
        unidadeAtiva={activeApto}
      />

      {/* 4. Feedback Toast */}
      {showToast && (
        <div className="toast-success-top">
          <CheckCircle size={18} />
          <span>Salvo offline com sucesso!</span>
        </div>
      )}

      {/* 5. Câmera customizada in-app (Totalmente independente da árvore do modal) */}
      {customCameraOpen && (
        <CustomCamera
          onSaveReading={handleCaptureAndSave}
          onClose={() => setCustomCameraOpen(false)}
          initialValue={leiturasValores[activeApto]?.[tipoMedicaoAtivo] || ''}
        leituras={todasLeiturasAnteriores}
        unidadeAtiva={activeApto}
        />
      )}

      {/* 6. Modal Customizado de Opções de Exportação */}
      {isExportModalOpen && (
        <div className="export-modal-overlay" onClick={() => setIsExportModalOpen(false)}>
          <div className="export-modal-container" onClick={e => e.stopPropagation()}>
            <div className="export-modal-header">
              <h3>Opções de Exportação</h3>
              <button className="export-modal-close" onClick={() => setIsExportModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="export-modal-body">
              <p>Escolha o formato que deseja exportar:</p>
              <div className="export-modal-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button 
                  className="btn-export-primary" 
                  onClick={() => executeExport('agua')}
                >
                  Enviar Apenas Água
                </button>
                <button 
                  className="btn-export-primary" 
                  onClick={() => executeExport('gas')}
                >
                  Enviar Apenas Gás
                </button>
                <button 
                  className="btn-export-primary" 
                  onClick={() => executeExport('energia')}
                >
                  Enviar Apenas Energia
                </button>
                <button 
                  className="btn-export-secondary" 
                  style={{ backgroundColor: '#0284c7', color: 'white', borderColor: '#0284c7' }}
                  onClick={() => executeExport('todos')}
                >
                  Enviar Todos (Consolidado)
                </button>

                <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '6px 0' }}></div>

                <button 
                  className="btn-export-secondary" 
                  style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                  onClick={handleLimparMes}
                >
                  Limpar / Iniciar Próximo Mês
                </button>

                <button 
                  className="btn-export-cancel" 
                  onClick={() => setIsExportModalOpen(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showModalLimpeza && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '24px', width: '100%', maxWidth: '350px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#1f2937' }}>
              Limpar Prancheta
            </h3>
            
            <p style={{ color: '#4b5563', marginBottom: '24px', fontSize: '14px', lineHeight: '1.5' }}>
              Deseja realmente limpar todas as fotos da tela para iniciar uma nova coleta?
              <br/><br/>
              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                (Isso NÃO apagará as fotos do celular nem do banco).
              </span>
            </p>
            
            <button 
              onClick={executarLimpezaFotosUI} 
              style={{ width: '100%', backgroundColor: '#ef4444', color: 'white', fontWeight: 'bold', padding: '14px', borderRadius: '12px', marginBottom: '12px', border: 'none' }}
            >
              Sim, limpar tela
            </button>
            
            <button 
              onClick={() => setShowModalLimpeza(false)} 
              style={{ width: '100%', backgroundColor: '#f3f4f6', color: '#374151', fontWeight: 'bold', padding: '14px', borderRadius: '12px', border: 'none' }}
            >
              Cancelar
            </button>

          </div>
        </div>
      )}
    </>
  );
};

export default LeituraFotoModal;
