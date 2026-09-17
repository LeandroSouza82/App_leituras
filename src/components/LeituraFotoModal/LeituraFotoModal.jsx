import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Camera as CameraIcon, X, CheckCircle, Settings, FileSpreadsheet, Upload, Trash2 } from 'lucide-react';
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
import { salvarLeituraOffline } from '../../services/syncService';
import { sincronizarLeiturasNuvemParaLocal, rotacionarLeituraAnteriorLocal, obterLeituraAnterior, obterMapaLeiturasAnteriores, deduplicarGavetaAnteriores } from '../../services/leiturasAnterioresService';
import { filesystemService } from '../../services/filesystemService';
import { UCondoImportService } from '../../services/ucondoImportService';
import { customConfirm, customConfirmDestrutivo, customAlert } from '../CustomPrompt/CustomPrompt';
import CustomCamera from '../CustomCamera/CustomCamera';
import { parseLeituraNumerica, formatarLeitura4Casas } from '../../utils/leituraNumerica';
import { ordenarUnidadesNatural } from '../../utils/ordenarUnidades';
import './LeituraFotoModal.css';

// Helper de sanitização resiliente a acentos para nomes de diretórios/arquivos
const sanitizeName = (name) => {
  if (!name) return 'Desconhecido';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
};

const normalizarServicoLocal = (servico) => {
  return String(servico || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

const obterAbaExclusivaDoCondominio = (leitura) => {
  const tipo = String(leitura?.tipoLeitura || leitura?.tipo_leitura || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (tipo === 'somente gas' || tipo === 'gas') return 'gas';
  if (tipo === 'somente agua' || tipo === 'agua') return 'agua';

  const somenteEnergia = tipo.includes('energia') && !tipo.includes('agua') && !tipo.includes('gas');
  return somenteEnergia ? 'energia' : null;
};

const gerarChaveLeituraLocal = (condominioId, unidadeId, servico) => {
  const condominio = String(condominioId || '').trim();
  const unidade = String(unidadeId || '').trim();
  const servicoKey = normalizarServicoLocal(servico);

  if (!condominio || !unidade || !servicoKey) {
    return null;
  }

  return `${condominio}_${unidade}_${servicoKey}`;
};

/**
 * Lê o valor atual digitado para uma unidade/serviço de leiturasValores,
 * tolerando tanto a chave plana ("A-101_agua") quanto a aninhada (["A-101"]["agua"]).
 * Usa normalizarServicoLocal para garantir que "AGUA", "Água" etc. encontrem "agua".
 */
const obterLeituraAtualLocal = (leiturasValores, unidadeId, servico) => {
  const unidade = String(unidadeId || '').trim();
  const servicoKey = normalizarServicoLocal(servico); // normaliza p/ minúsculo sem acentos
  if (!unidade || !servicoKey) return null;
  const val =
    leiturasValores[`${unidade}_${servicoKey}`]   // chave plana (gravada pelo handleSaveReading)
    ?? leiturasValores[unidade]?.[servicoKey]      // chave aninhada (gravada pelo verificarFotosSalvas)
    ?? null;
  return (val === '' ? null : val);
};



const formatarLeituraLocal = (valor) => formatarLeitura4Casas(valor);

/**
 * Helper canônico de normalização numérica para leituras.
 */
const parseLeituraNum = (valor) => parseLeituraNumerica(valor);

/**
 * Lê o valor atual de uma leitura DIRETAMENTE do localStorage (fonte persistida).
 * Esta é a mesma fonte que restaura o campo quando o usuário sai e volta ao apartamento.
 * @param {string} condominioId - ID do condomínio (leitura.id)
 * @param {string} unidadeId   - Identificador da unidade (ex: "A-101")
 * @param {string} servico     - Serviço (qualquer case: "agua", "AGUA", "Água")
 * @returns {string|null} valor formatado ou null se não existir
 */
const obterLeituraAtualPersistida = (condominioId, unidadeId, servico) => {
  const chaveLocal = gerarChaveLeituraLocal(condominioId, unidadeId, servico);
  if (!chaveLocal) return null;
  const valor = localStorage.getItem(`valor_${chaveLocal}`);
  if (valor === null || valor === undefined || valor === '') return null;
  return valor;
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
          {leituraAnterior !== undefined && leituraAnterior !== null && (
            <span style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
              Ant: {formatarLeituraLocal(leituraAnterior)}
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
  const [tipoMedicaoAtivo, setTipoMedicaoAtivo] = useState(
    () => obterAbaExclusivaDoCondominio(leitura) || 'agua'
  );
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

  // Fonte única da leitura anterior exibida: recalcula imediatamente para o
  // serviço ativo e nunca reaproveita o mapa de outra aba.
  const todasLeiturasAnteriores = useMemo(() => {
    if (!isOpen || !leitura) return {};

    const condId = leitura?.id || leitura?.condominio_id;
    try {
      return obterMapaLeiturasAnteriores(condId, tipoMedicaoAtivo);
    } catch (_) {
      return {};
    }
  }, [isOpen, leitura, tipoMedicaoAtivo, hydrationCounter]);

  // Evita que a tela pinte a aba Água durante a leitura assíncrona dos dados
  // quando o condomínio já está configurado exclusivamente para Energia/Gás.
  useLayoutEffect(() => {
    if (!isOpen || !leitura) return;
    const abaExclusiva = obterAbaExclusivaDoCondominio(leitura);
    if (abaExclusiva) setTipoMedicaoAtivo(abaExclusiva);
  }, [isOpen, leitura]);

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
    const condId = leitura?.id || leitura?.condominio_id;
    const handleHydration = (event) => {
      if (String(event?.detail?.condId) === String(condId)) {
        setHydrationCounter(prev => prev + 1);
      }
    };
    window.addEventListener('offline_cache_hydrated', handleHydration);
    return () => window.removeEventListener('offline_cache_hydrated', handleHydration);
  }, [leitura]);

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

      const resultado = await UCondoImportService.atualizarUnidadesCondominio(
        condId,
        buffer,
        unidadesCarregadas,
        leitura?.nome || ''
      );

      if (resultado) {
        const novasUnidades = Array.isArray(resultado) ? resultado : (resultado.unidades || []);
        if (novasUnidades.length > 0) {
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

          const servicoMsg = resultado.servico ? ` (${resultado.servico})` : '';
          const leiturasMsg = resultado.totalLeituras ? ` com ${resultado.totalLeituras} leituras anteriores importadas` : '';
          await customAlert(`✅ ${novasUnidades.length} unidades atualizadas com sucesso${servicoMsg}${leiturasMsg}!`);
        }
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
            // Normalizar, desduplicar e ordenar naturalmente antes de usar.
            // Isso autocorrige caches antigos corrompidos (ex: A-0704 antes de A-0101)
            // na primeira abertura após esta versão do app.
            const unidadesOrdenadas = ordenarUnidadesNatural(
              unidadesParaCarregar.map(u =>
                typeof u === 'object'
                  ? String(u.numero || u.identificador || u.nome || u.unidade || '').trim()
                  : String(u || '').trim()
              )
            );

            setUnidadesAtualizadas(unidadesOrdenadas);

            // Regravar o cache já na ordem correta para sanar arquivos antigos
            localStorage.setItem(`unidades_${condId}`, JSON.stringify(unidadesOrdenadas));
            Filesystem.writeFile({
              path: `unidades_${condId}.json`,
              data: JSON.stringify(unidadesOrdenadas),
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

            // O tipo explícito do condomínio tem prioridade sobre gavetas
            // antigas de outro serviço. Ex.: Energia configurada não pode
            // voltar para Água só porque existe uma planilha de Água salva.
            if (temEnergiaDb && !temAguaDb && !temGasDb) {
              abaInicial = 'energia';
            } else if (temAguaDb || temAguaPlanilha) {
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
  // listaCompleta é a FONTE CANÔNICA para renderização, validação e exportação.
  // ordenarUnidadesNatural garante que a ordem seja sempre alfanumérica correta,
  // independente da ordem salva no cache (corrige caches antigos durante o uso).
  const { unidadesPorTorre, torres, listaCompleta } = useMemo(() => {
    const mapa = {};
    const listaRaw = unidadesCarregadas.length > 0 ? unidadesCarregadas : (leitura?.unidades || []);

    // Aplicar ordenação natural como última linha de defesa (cobre todos os caminhos de entrada)
    const listaOrdenada = ordenarUnidadesNatural(
      listaRaw.map(u =>
        typeof u === 'object'
          ? String(u.numero || u.identificador || u.nome || u.unidade || '').trim()
          : String(u || '').trim()
      )
    );

    listaOrdenada.forEach(unidadeFormatada => {
      try {
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
      listaCompleta: listaOrdenada
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

              const chaveLocal = gerarChaveLeituraLocal(leitura.id, unidade, servico);
              if (chaveLocal) {
                const localVal = localStorage.getItem(`valor_${chaveLocal}`);
                if (localVal) {
                  if (!valoresSalvos[unidade]) valoresSalvos[unidade] = {};
                  valoresSalvos[unidade][servico] = formatarLeituraLocal(localVal);
                  valoresSalvos[`${unidade}_${servico}`] = formatarLeituraLocal(localVal);
                }
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

            const chaveLocal = gerarChaveLeituraLocal(leitura.id, unidade, servico);
            if (chaveLocal) {
              const localVal = localStorage.getItem(`valor_${chaveLocal}`);
              if (localVal) {
                if (!valoresSalvos[unidade]) valoresSalvos[unidade] = {};
                valoresSalvos[unidade][servico] = formatarLeituraLocal(localVal);
                valoresSalvos[`${unidade}_${servico}`] = formatarLeituraLocal(localVal);
              }
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
                valoresSalvos[unidade][servico] = formatarLeituraLocal(val);
                valoresSalvos[`${unidade}_${servico}`] = formatarLeituraLocal(val);
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
    // Verifica se realmente existe a foto no estado local
    const temFoto = fotosCapturadas[apto] && fotosCapturadas[apto][tipoMedicaoAtivo];

    if (concluido && temFoto) {
      setIsPreviewOpen(true);
    } else {
      // Se não tem foto (mesmo se 'concluido' constar no render/storage),
      // força a reabertura da câmera
      handleDispararCamera(apto);
    }
  };

  const handleExcluirFoto = async (overrideApto = null, skipConfirm = false) => {
    if (!skipConfirm) {
      if (!await customConfirmDestrutivo('Deseja realmente excluir esta foto e as evidências locais?', 'Excluir Foto')) return;
    }

    try {
      const unidadeId = String(overrideApto || activeApto).trim();
      const tipoServico = tipoMedicaoAtivo.toUpperCase();
      const servicoKey = tipoMedicaoAtivo.toLowerCase();

      // 1. LIMPEZA IMEDIATA (LOCAL-FIRST) PARA NÃO BLOQUEAR A UI
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
          if (Object.keys(novo[unidadeId]).length === 0) delete novo[unidadeId];
        }
        return novo;
      });

      setIsPreviewOpen(false);
      setActiveApto(null);

      // 2. EXCLUSÃO FÍSICA DO ARQUIVO (Ainda no fluxo local, sem depender de internet)
      const safeCondName = sanitizeName(leitura.nome);
      const pastaCondominio = `FastLeituras/${safeCondName}`;
      const newFileName = `Apto${unidadeId}_${tipoServico}.jpg`;
      const fullNewPath = `${pastaCondominio}/${newFileName}`;

      try {
        await Filesystem.deleteFile({ path: fullNewPath, directory: Directory.Cache });
      } catch (e) {
        // Ignora se não existir, não deve reverter a UI
      }

      // 2b. EXCLUSÃO DO ARQUIVO PERSISTIDO NO LOTE OFFLINE (Directory.Data)
      // Isolada por condomínio atual + unidade atual + serviço atual.
      // Tolerante a arquivo inexistente — nunca quebra a interface.
      try {
        const safeCondNameOffline = filesystemService.sanitizeName(leitura.nome);
        const offlinePath = `Backups/${safeCondNameOffline}/Apto${unidadeId}_${tipoServico}.jpg`;
        await Filesystem.deleteFile({ path: offlinePath, directory: Directory.Data });
      } catch (e) {
        // Arquivo pode não existir no lote offline — ignora silenciosamente
      }

      // 3. SINCRONIZAÇÃO EM BACKGROUND (Arquivos Antigos, Fila e Supabase)
      (async () => {
        try {
          const filesAntigos = await StorageService.listFiles(`leitura_foto_${leitura.id}_${unidadeId}_`);
          for (const file of filesAntigos) {
            if (file.toLowerCase().includes(tipoServico.toLowerCase())) {
              await StorageService.deleteFile(file);
            }
          }

          const condominioIdAtual = String(leitura?.id ?? leitura?.condominio_id ?? '').trim();
          const condominioNomeAtual = String(leitura?.nome ?? '').trim().toLowerCase();

          ['fila_sync_auto', 'leituras_pendentes'].forEach((key) => {
            const raw = localStorage.getItem(key);
            if (raw) {
              const filaAtual = JSON.parse(raw);
              if (Array.isArray(filaAtual) && filaAtual.length > 0) {
                const filaFiltrada = filaAtual.filter((item) => {
                  const itemCondominioId = String(item.condominio_id ?? item.condominioId ?? '').trim();
                  const itemCondominioNome = String(item.condominio_nome ?? item.condominioNome ?? '').trim().toLowerCase();
                  const mesmoCondominio = itemCondominioId && condominioIdAtual
                    ? itemCondominioId === condominioIdAtual
                    : !!(itemCondominioNome && condominioNomeAtual && itemCondominioNome === condominioNomeAtual);
                  const mesmaUnidade = String(item.unidade_id ?? '') === unidadeId || String(item.unidadeId ?? '') === unidadeId;
                  const mesmoServico = (item.servico ?? item.tipoServico ?? '').toUpperCase() === tipoServico;
                  return !(mesmoCondominio && mesmaUnidade && mesmoServico);
                });
                localStorage.setItem(key, JSON.stringify(filaFiltrada));
              }
            }
          });

          if (supabase && leitura?.nome) {
            const { data: authData } = await supabase.auth.getUser();
            const userId = authData?.user?.id;
            if (userId) {
              await supabase
                .from('leituras_detalhes')
                .delete()
                .eq('condominio_nome', leitura.nome)
                .eq('leiturista_id', userId)
                .eq('unidade_id', unidadeId)
                .eq('servico', tipoServico);
            }
          }
        } catch (bgErr) {
          console.error('Erro em background ao limpar dados remotos/sync da foto:', bgErr);
        }
      })();

    } catch (err) {
      console.error('Erro ao excluir foto:', err);
      await customAlert('Ocorreu um erro ao excluir a foto. Tente novamente.');
    }
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
      const valorNumerico = parseLeituraNum(valor);

      if (valorNumerico === null) {
        throw new Error('Valor da leitura ausente ou inválido.');
      }

      // ── FASE 2: Validação leitura atual < anterior ──────────────────────
      // Resolve a leitura anterior canônica pela mesma fonte unificada que alimenta a UI
      (() => {
        try {
          const leitAnt = obterLeituraAnterior(condId, unidadeId, tipoMedicaoAtivo);
          if (leitAnt === null) return; // sem baseline: primeira leitura, permitir
          // Validação: bloquear somente se estritamente menor
          if (valorNumerico < leitAnt) {
            // Usa IIFE async para aguardar e depois retornar sinalizando bloqueio
            // Não é possível retornar de dentro de IIFE, então lança exceção especial
            throw Object.assign(new Error('LEITURA_MENOR_QUE_ANTERIOR'), {
              leituraAnterior: leitAnt,
              leituraAtual: valorNumerico,
            });
          }
        } catch (e) {
          if (e.message === 'LEITURA_MENOR_QUE_ANTERIOR') throw e;
          // Outros erros (parse, localStorage): não bloquear
        }
      })();
      // ────────────────────────────────────────────────────────────────────

      // O salvamento diário não deve rotacionar a leitura anterior. A leitura anterior fica INTACTA.

      // OFFLINE-FIRST DESACOPLADO: O salvamento no modal unitário guarda apenas no estado local.
      // O enfileiramento oficial para sync (salvarLeituraOffline) ocorrerá APENAS no Salvar Leituras (Global).

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
      // Mantém o preview da foto até o salvamento global das leituras.

      // NOVO: Persiste no LocalStorage (Garantia de Sobrevivência)
      try {
        const chaveStorage = `leituras_anteriores_${condId}`;
        const str = localStorage.getItem(chaveStorage);
        if (str) {
          let arr = JSON.parse(str);
          if (Array.isArray(arr)) {
            arr = deduplicarGavetaAnteriores(arr);
            const idx = arr.findIndex(l => String(l.unidade).trim() === String(unidadeId));
            if (idx !== -1) {
              arr[idx] = {
                ...arr[idx],
                leitura_atual: valorNumerico
              };
            } else {
              arr.push({
                unidade: String(unidadeId).trim(),
                leitura_atual: valorNumerico
              });
            }
            localStorage.setItem(chaveStorage, JSON.stringify(arr));
          }
        }
      } catch(e) {
        console.error("Erro ao atualizar localStorage", e);
      }

      const chaveLocal = gerarChaveLeituraLocal(leitura.id, unidadeId, tipoMedicaoAtivo);

      if (!chaveLocal) {
        console.error(
          '[LEITURA LOCAL] Não foi possível gerar a chave de persistência'
        );
      } else {
        localStorage.setItem(
          `valor_${chaveLocal}`,
          String(valorNumerico)
        );
        localStorage.setItem(
          `concluido_${chaveLocal}`,
          'true'
        );
        if (localFileName) {
          localStorage.setItem(
            `foto_path_${chaveLocal}`,
            localFileName
          );
          localStorage.setItem(
            `foto_directory_${chaveLocal}`,
            'DATA'
          );
        }
      }

      exibirToastSucesso();
      setIsPreviewOpen(false);
      setActiveApto(null);

    } catch (error) {
      if (error.message === 'LEITURA_MENOR_QUE_ANTERIOR') {
        const fmtAnt = String(error.leituraAnterior).replace('.', ',');
        const fmtAt  = String(error.leituraAtual).replace('.', ',');
        await customAlert(
          `A leitura atual não pode ser menor que a leitura anterior.\n\nLeitura anterior: ${fmtAnt}\nLeitura informada: ${fmtAt}\n\nCorrija o valor antes de continuar.`,
          'Leitura inválida'
        );
        // NÃO salva, NÃO persiste, NÃO fecha — mantém usuário no fluxo
        return;
      }
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
      await CameraService.salvarFotoEmPasta(fotoWhatsApp, pastaCondominio, fileName);

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
        const condominioIdAtual = String(leitura?.id ?? leitura?.condominio_id ?? '').trim();
        const condominioNomeAtual = String(leitura?.nome ?? '').trim().toLowerCase();
        ['fila_sync_auto', 'leituras_pendentes'].forEach((key) => {
          const raw = localStorage.getItem(key);
          if (raw) {
            const filaAtual = JSON.parse(raw);
            if (Array.isArray(filaAtual)) {
              const filaFiltrada = filaAtual.filter((item) => {
                const itemCondominioId = String(item.condominio_id ?? item.condominioId ?? '').trim();
                const itemCondominioNome = String(item.condominio_nome ?? item.condominioNome ?? '').trim().toLowerCase();
                const mesmoCondominio = itemCondominioId && condominioIdAtual
                  ? itemCondominioId === condominioIdAtual
                  : !!(itemCondominioNome && condominioNomeAtual && itemCondominioNome === condominioNomeAtual);
                const mesmaUnidade = String(item.unidade_id ?? item.unidadeId ?? '') === unidadeId;
                const mesmoServico = (item.servico ?? item.tipoServico ?? '').toUpperCase() === tipoServico;
                return !(mesmoCondominio && mesmaUnidade && mesmoServico);
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
          const { data: authData } = await supabase.auth.getUser();
          const userId = authData?.user?.id;
          if (userId && leitura?.nome) {
            await supabase
              .from('leituras_detalhes')
              .delete()
              .eq('condominio_nome', leitura.nome)
              .eq('leiturista_id', userId)
              .eq('unidade_id', unidadeId)
              .eq('servico', tipoServico);
          }
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
    const abaExclusiva = obterAbaExclusivaDoCondominio(leitura);

    if (abaExclusiva) {
      executeExport(abaExclusiva);
    } else {
      // Condomínios mistos sempre precisam escolher o formato de exportação.
      setIsExportModalOpen(true);
    }
  };

  // FUNÇÃO MODULAR DE VALIDAÇÃO RIGOROSA ANTES DO ENVIO
  // fotosMap: mapa de fotos em memória (fotosCapturadas). Obrigatório para detectar FOTO_AUSENTE.
  const validarLeiturasLote = (scopeParam, tipoCondominioOrig, unidadesList, leiturasVal, fotosMap) => {
    const tipo = String(tipoCondominioOrig || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let servicosParaValidar = [];
    if (scopeParam === 'todos') {
      if (tipo.includes('agua') || tipo === '') servicosParaValidar.push('agua');
      if (tipo.includes('gas') || tipo === '') servicosParaValidar.push('gas');
      if (tipo.includes('energia')) servicosParaValidar.push('energia');
    } else {
      servicosParaValidar = [scopeParam];
    }

    const condId = leitura?.id || leitura?.condominio_id;

    for (const uni of unidadesList) {
      const apStr = String(uni.unidade || uni.nome || uni).trim();
      for (const srv of servicosParaValidar) {
        const srvKey = normalizarServicoLocal(srv);

        // ── FASE 1: verificar leitura atual ───────────────────────────────
        // Consulta as mesmas fontes já existentes: estado em memória e localStorage.
        // Valor antigo sozinho NÃO é prova de conclusão — a foto ainda precisa existir.
        const val =
          leiturasVal[`${apStr}_${srvKey}`]
          ?? leiturasVal[apStr]?.[srvKey]
          ?? obterLeituraAtualPersistida(condId, apStr, srvKey);
        const numVal = parseLeituraNum(val);

        if (val === undefined || val === null || val === '' || numVal === null || Number.isNaN(numVal)) {
          return { isValid: false, motivo: 'LEITURA_AUSENTE', unidade: apStr, servico: srvKey };
        }

        // ── FASE 2: verificar evidência de foto ───────────────────────────
        // Aceita foto em memória OU foto persistida (foto_path + concluido === 'true').
        // concluidosMemoria sozinho NÃO prova existência de foto.
        // foto_path sozinho (sem concluido) NÃO prova existência de foto.
        const temFotoMemoria = Boolean(fotosMap?.[apStr]?.[srvKey]);

        const chaveLocal = gerarChaveLeituraLocal(condId, apStr, srvKey);
        const fotoPathPersistida = chaveLocal
          ? localStorage.getItem(`foto_path_${chaveLocal}`)
          : null;
        const concluidoPersistido = chaveLocal
          ? localStorage.getItem(`concluido_${chaveLocal}`) === 'true'
          : false;
        const temFotoPersistida = Boolean(fotoPathPersistida) && concluidoPersistido;

        const temFoto = temFotoMemoria || temFotoPersistida;

        if (!temFoto) {
          return { isValid: false, motivo: 'FOTO_AUSENTE', unidade: apStr, servico: srvKey };
        }

        // ── FASE 3: barreira atual < anterior ─────────────────────────────
        // Executada somente após leitura e foto confirmadas.
        const leitAnt = obterLeituraAnterior(condId, apStr, srv);
        if (leitAnt !== null) {
          const atFixed = Math.round(numVal * 10000);
          const antFixed = Math.round(leitAnt * 10000);
          if (atFixed < antFixed) {
            return {
              isValid: false,
              motivo: 'MENOR_QUE_ANTERIOR',
              unidade: apStr,
              servico: srvKey,
              leituraAtual: numVal,
              leituraAnterior: leitAnt,
            };
          }
        }
        // ──────────────────────────────────────────────────────────────────
      }
    }
    return { isValid: true };
  };

  const executeExport = async (scope) => {
    // Etapa de diagnóstico
    let etapaAtual = 'INICIO';

    setIsExportModalOpen(false);

    // Determina serviço
    const servico = (scope && ['agua', 'gas', 'energia', 'todos'].includes(scope))
      ? scope
      : tipoMedicaoAtivo;

    // ------------------------
    // VALIDAÇÃO
    // ------------------------
    etapaAtual = 'VALIDACAO';
    // listaCompleta é a fonte canônica (mesma ordem usada no fluxo de exportação).
    // Nunca usar unidadesCarregadas aqui — ela pode estar desatualizada ou em ordem diferente.
    const validacao = validarLeiturasLote(
      servico,
      leitura?.tipoLeitura || leitura?.tipo_leitura,
      listaCompleta,
      leiturasValores,
      fotosCapturadas
    );
    if (!validacao.isValid) {
      if (validacao.motivo === 'MENOR_QUE_ANTERIOR') {
        const fmtAnt = String(validacao.leituraAnterior).replace('.', ',');
        const fmtAt  = String(validacao.leituraAtual).replace('.', ',');
        await customAlert(
          `A leitura atual não pode ser menor que a leitura anterior.\n\nUnidade: ${validacao.unidade} (${validacao.servico.toUpperCase()})\nLeitura anterior: ${fmtAnt}\nLeitura informada: ${fmtAt}\n\nCorrija o valor antes de continuar.`,
          'Leitura inválida'
        );
      } else if (validacao.motivo === 'FOTO_AUSENTE') {
        await customAlert(
          `A unidade ${validacao.unidade} (${validacao.servico.toUpperCase()}) possui leitura, mas ainda não possui a foto obrigatória do medidor.`,
          'Foto Pendente'
        );
      } else {
        // LEITURA_AUSENTE ou motivo não reconhecido
        await customAlert(
          `A unidade ${validacao.unidade} (${validacao.servico.toUpperCase()}) ainda não possui leitura atual preenchida.`,
          'Leitura Pendente'
        );
      }

      // Exibe o serviço exato apontado pela validação antes de localizar o card.
      setTipoMedicaoAtivo(validacao.servico);
      setTimeout(() => {
        const cardErro = document.getElementById(`card-unidade-${validacao.unidade}`);
        if (cardErro) {
          cardErro.scrollIntoView({ behavior: 'smooth', block: 'center' });
          cardErro.classList.add('highlight-pulse');
          setTimeout(() => cardErro.classList.remove('highlight-pulse'), 3000);
        }
      }, 300);
      return;
    }

    // ------------------------
    // CONFIRMAÇÃO
    // ------------------------
    etapaAtual = 'CONFIRMACAO';
    const nomeAmigavel = servico === 'todos' ? 'Consolidado (Todos)' : servico.toUpperCase();
    const mensagemConfirmacao = `Confirmar envio de ${nomeAmigavel}? Esta ação enviará os dados para o WhatsApp.`;
    const isConfirmed = await customConfirm(mensagemConfirmacao, 'Confirmação de Envio');
    if (!isConfirmed) return;

    // ------------------------
    // INÍCIO DO PROCESSAMENTO
    // ------------------------
    etapaAtual = 'INICIANDO';
    setExportando(true);

    try {
      const condId = leitura?.id || leitura?.condominio_id;

      // listaDeUnidades: fonte canônica de unidades para o loop de processarServico.
      // Exportar NÃO rotaciona leitura anterior — isso é responsabilidade da lixeira (Fase 3B).
      const storageAnteriorExterno = localStorage.getItem(`leituras_anteriores_${condId}`);
      let listaDeUnidades = storageAnteriorExterno
        ? JSON.parse(storageAnteriorExterno)
        : unidadesCarregadas.map(u => ({
            unidade: String(u.unidade || u.nome || u).trim(),
          }));

      // -------------------------------------------------
      // PREPARA DADOS PARA LEITURAS_DETALHES
      // -------------------------------------------------
      etapaAtual = 'MONTAR_PAYLOAD';
      const filaAtual = JSON.parse(localStorage.getItem('fila_sync_auto') || '[]');
      const leiturasDbIds = JSON.parse(localStorage.getItem('leituras_db_ids') || '{}');

      const ano = leitura?.ano_referencia || new Date().getFullYear();
      const mes = leitura?.mes_referencia || (new Date().getMonth() + 1);

      // -------------------------------------------------
      // PROCESSA CADA SERVIÇO
      // -------------------------------------------------
      const processarServico = async (apString, servicoAtual) => {
        const valorPersistido = obterLeituraAtualPersistida(leitura.id, apString, servicoAtual);

        const servicoKey = normalizarServicoLocal(servicoAtual);
        const valorState =
          leiturasValores[`${apString}_${servicoKey}`]
          ?? leiturasValores[apString]?.[servicoKey]
          ?? null;

        const valStr = valorPersistido ?? valorState;

        if (valStr === null || valStr === undefined || valStr === '') {
          return;
        }

        const valNumerico = parseLeituraNumerica(valStr);

        if (valNumerico === null || Number.isNaN(valNumerico)) {
          return;
        }

        const srvUpper = servicoAtual.toUpperCase();
        const localFileName = `Apto${apString}_${srvUpper}.jpg`;

        const chaveLocal = gerarChaveLeituraLocal(leitura.id, apString, servicoAtual);
        const photoPathReal = chaveLocal ? localStorage.getItem(`foto_path_${chaveLocal}`) : null;

        if (!photoPathReal) {
          return;
        }

        // -----------------------
        // MONTAR CHAVE
        // -----------------------
        etapaAtual = 'MONTAR_CHAVE';
        if (!condId) throw new Error('condId ausente');
        if (!apString) throw new Error('unidade ausente');
        if (!srvUpper) throw new Error('servico ausente');
        if (!ano) throw new Error('ano_referencia ausente');
        if (!mes) throw new Error('mes_referencia ausente');
        const chaveLeitura = `${condId}|${apString}|${srvUpper}|${ano}|${mes}`;

        // -----------------------
        // GERAR UUID
        // -----------------------
        etapaAtual = 'GERAR_UUID';
        if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
          throw new Error('crypto.randomUUID indisponível neste ambiente');
        }
        let dbIdExistente = leiturasDbIds[chaveLeitura];

        if (!dbIdExistente) {
          const itemPendente = filaAtual.find(f =>
            f.unidade_id === apString &&
            f.servico === srvUpper &&
            f.condominio_id === condId
          );
          if (itemPendente && itemPendente.db_id) {
            dbIdExistente = itemPendente.db_id;
          }
        }

        if (!dbIdExistente) {
          dbIdExistente = crypto.randomUUID();
          leiturasDbIds[chaveLeitura] = dbIdExistente;
          localStorage.setItem('leituras_db_ids', JSON.stringify(leiturasDbIds));
        }

        const payload = {
          db_id: dbIdExistente,
          condominio_id: condId,
          condominio_nome: leitura.nome,
          unidade_id: apString,
          servico: srvUpper,
          leitura_atual: valNumerico,
          leiturista_id: null,
          data_leitura: new Date().toISOString(),
          fileName: localFileName,
          photoPath: photoPathReal,
          photoDirectory: 'DATA'
        };

        // -----------------------
        // ENFILEIRAR
        // -----------------------
        etapaAtual = 'ENFILEIRAR';

        await salvarLeituraOffline(payload, null, localFileName);
      };


      // Validação de segurança antes do loop
      if (!Array.isArray(listaDeUnidades)) {
        throw new Error('listaDeUnidades não foi inicializada como array');
      }
      if (listaDeUnidades.length === 0) {
        throw new Error('Nenhuma unidade disponível para montar o payload');
      }

      // Loop real por unidades
      for (const unidadeObj of listaDeUnidades) {
        const apString = String(unidadeObj.unidade).trim();
        if (servico === 'agua' || servico === 'todos') await processarServico(apString, 'agua');
        if (servico === 'gas' || servico === 'todos') await processarServico(apString, 'gas');
        if (servico === 'energia' || servico === 'todos') await processarServico(apString, 'energia');
      }

      const filaDepoisSync = JSON.parse(localStorage.getItem('fila_sync_auto') || '[]').length;

      // -------------------------------------------------
      // VALIDAÇÃO MATEMÁTICA: Atual < Anterior
      // -------------------------------------------------
      etapaAtual = 'VALIDAR_ANTERIORES';
      const falhas = [];

      for (const unidadeObj of listaDeUnidades) {
        const apString = String(unidadeObj.unidade).trim();

        const validarServico = (srv) => {
           if (servico !== srv && servico !== 'todos') return;
           const srvUpper = srv.toUpperCase();
           const servicoKey = normalizarServicoLocal(srv);
           const valAtualStr = leiturasValores[`${apString}_${servicoKey}`]
             ?? leiturasValores[apString]?.[srvUpper]
             ?? leiturasValores[apString]?.[servicoKey]
             ?? obterLeituraAtualPersistida(condId, apString, srv);

           if (valAtualStr === undefined || valAtualStr === null || String(valAtualStr).trim() === '') return;

           const valAtual = parseLeituraNum(valAtualStr);
           if (valAtual === null || isNaN(valAtual)) return;

           const valAnterior = obterLeituraAnterior(condId, apString, srvUpper);

           if (valAnterior !== null && !isNaN(valAnterior)) {
             const atFixed = Math.round(valAtual * 10000);
             const antFixed = Math.round(valAnterior * 10000);
             if (atFixed < antFixed) {
               falhas.push(`- ${apString} (${srvUpper}): Atual ${String(valAtual).replace('.', ',')} < Anterior ${String(valAnterior).replace('.', ',')}`);
             }
           }
        };

        validarServico('agua');
        validarServico('gas');
        validarServico('energia');
      }

      if (falhas.length > 0) {
        setLoading(false);
        await customAlert(
          `Não é possível exportar planilhas com medição atual menor que a anterior.\n\nVerifique as seguintes unidades:\n\n${falhas.join('\n')}`,
          'Leitura Regressiva Detectada'
        );
        return;
      }

      // -------------------------------------------------
      // EXPORTAR PARA WHATSAPP
      // -------------------------------------------------

      etapaAtual = 'EXPORTAR_WHATSAPP';
      const sucesso = await LeituraService.exportarParaWhatsApp(
        leitura,
        servico,
        listaCompleta,
        leiturasValores
      );

      if (sucesso) {
        // FINALIZADO COM SUCESSO
        etapaAtual = 'FINALIZACAO';
        exibirToastSucesso();

        // DIAGNÓSTICO: Verifica se o sync iniciou
        const syncDebugRAW = localStorage.getItem('sync_debug');
        if (!syncDebugRAW) {
          await customAlert(`Fila: ${filaDepoisSync}\nItens foram enfileirados, mas sincronizarFilaEmBackground não foi disparado (localStorage vazio).`, 'SYNC NÃO INICIOU');
        } else {
          try {
            const syncDbg = JSON.parse(syncDebugRAW);
            if (!syncDbg.iniciou) {
              await customAlert(`Fila: ${filaDepoisSync}\nItens foram enfileirados, mas sincronizarFilaEmBackground não foi disparado (iniciou=false).`, 'SYNC NÃO INICIOU');
            }
          } catch(e) {}
        }
      }
    } catch (err) {
      const mensagem = err?.message || String(err) || 'Erro desconhecido';
      console.error(err);
      await customAlert(`Etapa: ${etapaAtual}\nErro: ${mensagem}`, 'ERRO SALVAR LEITURAS');
    } finally {
      setExportando(false);
    }
  };

  const handleLimparMes = async () => {
    setIsExportModalOpen(false);

    if (isProcessing) return;

    const isConfirmed = await customConfirmDestrutivo(
      'Finalizar este ciclo?\n\nAs leituras atuais serão usadas como leitura anterior do próximo ciclo e as fotos/leitura atual serão limpas da tela.',
      'Finalizar Ciclo',
      'Finalizar'
    );

    if (!isConfirmed) return;

    setIsProcessing(true);

    const condId = leitura?.id || leitura?.condominio_id;
    try {
      const servicosAtivos = [];
      const t = String(leitura?.tipoLeitura || leitura?.tipo_leitura || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (t.includes('agua') || t === '') servicosAtivos.push('agua');
      if (t.includes('gas') || t === '') servicosAtivos.push('gas');
      if (t.includes('energia')) servicosAtivos.push('energia');

      let gavetaAnteriores = [];
      try {
        const rawGav = localStorage.getItem(`leituras_anteriores_${condId}`);
        if (rawGav) gavetaAnteriores = JSON.parse(rawGav) || [];
        if (!Array.isArray(gavetaAnteriores)) gavetaAnteriores = [];
      } catch {}

      const promocoes = [];

      for (const apStr of listaCompleta) {
        for (const srv of servicosAtivos) {
          const valPersistido = obterLeituraAtualPersistida(condId, apStr, srv);
          const servicoKey = normalizarServicoLocal(srv);
          const valState = leiturasValores[`${apStr}_${servicoKey}`] ?? leiturasValores[apStr]?.[servicoKey];
          const valStr = valPersistido ?? valState;

          const numVal = parseLeituraNum(valStr);
          if (numVal !== null) {
            const leitAnt = obterLeituraAnterior(condId, apStr, srv);
            if (leitAnt !== null) {
              const atFixed = Math.round(numVal * 10000);
              const antFixed = Math.round(leitAnt * 10000);
              if (atFixed < antFixed) {
                 const fmtAnt = String(leitAnt).replace('.', ',');
                 const fmtAt  = String(numVal).replace('.', ',');
                 await customAlert(
                   `Não é possível finalizar o ciclo.\n\nA unidade ${apStr} (${srv.toUpperCase()}) possui leitura atual (${fmtAt}) menor que a anterior (${fmtAnt}).\n\nCorrija o valor antes de continuar.`,
                   'Leitura inválida'
                 );
                 return;
              }
            }
            promocoes.push({ unidade: apStr, servico: srv, valor: numVal });
          }
        }
      }

      let algumaFalha = false;
      for (const promo of promocoes) {
        const result = rotacionarLeituraAnteriorLocal(condId, promo.unidade, promo.servico, promo.valor);
        if (!result || !result.ok) {
          algumaFalha = true;
          break;
        }
      }

      if (algumaFalha) {
         await customAlert('Falha ao promover algumas leituras localmente. A limpeza foi cancelada para evitar perda de dados.', 'Erro de Persistência');
         return;
      }

      await resetarEstadoLeiturasAtivas(condId);

      setFotosCapturadas({});
      setConcluidosMemoria({});
      setLeiturasValores({});

      await customAlert(`${promocoes.length} leituras promovidas!\nCondomínio limpo e finalizado com sucesso. Pronto para o próximo mês.`);
      onClose();
    } catch (err) {
      await customAlert('Erro inesperado ao finalizar condomínio: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
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
                    onClick={(e) => { e.stopPropagation(); handleLimparMes(); }}
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
              <div className={`selectors-top-row ${showAgua && showGas && showEnergia ? 'selectors-top-row--three-services' : ''}`}>
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
                      leituraAnterior={todasLeiturasAnteriores[apto] ?? null}
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
        initialValue={formatarLeituraLocal(obterLeituraAtualLocal(leiturasValores, activeApto, tipoMedicaoAtivo))}
        leituraAnterior={todasLeiturasAnteriores[activeApto] ?? null}
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
          initialValue={formatarLeituraLocal(obterLeituraAtualLocal(leiturasValores, activeApto, tipoMedicaoAtivo))}
          leituraAnterior={todasLeiturasAnteriores[activeApto] ?? null}
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
      </>
  );
};

export default LeituraFotoModal;
