import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Camera as CameraIcon, X, CheckCircle, Share2, Settings, FileSpreadsheet, Upload } from 'lucide-react';
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
import { filesystemService } from '../../services/filesystemService';
import { UCondoImportService } from '../../services/ucondoImportService';
import { FilePickerService } from '../../services/filePickerService';
import { customConfirm } from '../CustomPrompt/CustomPrompt';
import CustomCamera from '../CustomCamera/CustomCamera';
import './LeituraFotoModal.css';

// Helper de sanitização resiliente a acentos para nomes de diretórios/arquivos
const sanitizeName = (name) => {
  if (!name) return 'Desconhecido';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
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
  const [pressedApto, setPressedApto] = useState(null);
  const toastTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const longPressFiredRef = useRef(false);

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

        alert(`✅ ${novasUnidades.length} unidades atualizadas com sucesso a partir da planilha!`);
      }
    } catch (err) {
      alert('Erro ao processar a planilha: ' + err.message);
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

  const handleUnitClick = (apto, thumbnail) => {
    setActiveApto(apto);
    if (thumbnail || concluidosMemoria[apto]?.[tipoMedicaoAtivo]) {
      setIsPreviewOpen(true);
    } else {
      handleDispararCamera(apto);
    }
  };

  const handleExcluirFoto = async (overrideApto = null, skipConfirm = false) => {
    if (!skipConfirm) {
      if (!window.confirm('Deseja realmente excluir esta foto e as evidências locais?')) return;
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
      alert('Ocorreu um erro ao excluir a foto. Tente novamente.');
    }
  };

  const longPressRef = useRef(null);

  const startLongPress = (apto, concluido) => {
    if (!concluido) return;
    
    setPressedApto(apto);
    longPressFiredRef.current = false;
    
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    
    longPressRef.current = setTimeout(async () => {
      longPressFiredRef.current = true;
      setPressedApto(null);
      
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
      const isConfirmed = await customConfirm(
        'Deseja realmente excluir esta foto?',
        'Excluir Foto'
      );
      if (isConfirmed) {
        handleExcluirFoto(apto, true);
      }
    }, 1000);
  };

  const cancelLongPress = (apto, thumbnail) => {
    setPressedApto(null);
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    
    // Se não foi concluído como long press, executa a ação de clique normal
    if (!longPressFiredRef.current) {
      handleUnitClick(apto, thumbnail);
    }
    
    longPressFiredRef.current = false;
  };

  const handleSaveReading = async (valor, fotoUrlOverride = null, fileNameOverride = null) => {
    try {
      const unidadeId = String(activeApto).trim();
      const fotoUrl = fotoUrlOverride || fotosCapturadas[unidadeId]?.[tipoMedicaoAtivo];

      if (!fotoUrl || fotoUrl.trim() === '') {
        alert('Falha ao processar a foto. A imagem não foi anexada corretamente.');
        return;
      }

      if (!valor) {
        throw new Error('Valor da leitura ausente.');
      }

      const servicoKey = tipoMedicaoAtivo.toLowerCase();
      const newFileName = `Apto${unidadeId}_${tipoMedicaoAtivo.toUpperCase()}.jpg`;
      
      let localFileName = fileNameOverride;

      // 1. BACKUP LOCAL OBRIGATÓRIO (Lote Offline - Organizado via filesystemService)
      if (fotoUrl.startsWith('data:image/jpeg;base64,')) {
        try {
          localFileName = await filesystemService.salvarFotoCondominio(leitura.nome, localFileName || newFileName, fotoUrl);
        } catch (e) {
          console.error("Falha ao salvar backup fisico via service:", e);
          throw new Error('Falha crítica ao gravar foto no disco (Lote Offline). ' + e.message);
        }
      }

      if (!localFileName) {
        throw new Error('Falha crítica: O arquivo físico da foto não pôde ser gerado ou encontrado no dispositivo.');
      }

      // Grava valor digitado
      localStorage.setItem(`valor_${leitura.id}_${unidadeId}_${tipoMedicaoAtivo}`, valor);

      // ✅ MEMÓRIA VISUAL PERSISTENTE: Marca a unidade como concluída no localStorage
      localStorage.setItem(`concluido_${leitura.id}_${unidadeId}_${servicoKey}`, 'true');

      setConcluidosMemoria(prev => ({
        ...prev,
        [unidadeId]: { ...(prev[unidadeId] || {}), [servicoKey]: true }
      }));

      setLeiturasValores(prev => ({
        ...prev,
        [unidadeId]: { ...(prev[unidadeId] || {}), [tipoMedicaoAtivo]: valor }
      }));


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
        condominio_id: leitura.id,
        condominio_nome: leitura.nome,
        unidade_id: unidadeId,
        servico: tipoMedicaoAtivo.toUpperCase(),
        leitura_atual: parseFloat(String(valor).replace(',', '.')),
        leiturista_id: activeUserId,
        data_leitura: new Date().toISOString(),
        fileName: localFileName
      };

      // ✅ OFFLINE-FIRST ABSOLUTO: Sem bloqueios de rede.
      // O app empurra a foto instantaneamente para a fila do syncService, 
      // liberando a UI (câmera) na hora, independente de ter 5G ou zero internet.
      await salvarLeituraOffline(payload, null, localFileName);
      
      // ✅ Feedback visual não bloqueante
      exibirToastSucesso();

      // Fecha o preview se estiver aberto (fallback para o fluxo antigo que ainda usa o preview)
      setIsPreviewOpen(false);

    } catch (error) {
      alert('❌ Erro inesperado ao salvar: ' + error.message);
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
      alert('⚠️ Erro ao processar a foto. Tente novamente.\n(Detalhe: ' + errMsg + ')');
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
    // 1. Validação Pré-Envio (Trava de Segurança Crítica)
    for (const apto of listaCompleta) {
      const fotoServicos = fotosCapturadas[apto] || {};
      const concluidoServicos = concluidosMemoria[apto] || {};
      const valorServicos = leiturasValores[apto] || {};

      const servicosComRegistro = new Set([
        ...Object.keys(fotoServicos),
        ...Object.keys(concluidoServicos)
      ]);

      for (const servico of servicosComRegistro) {
        const valor = valorServicos[servico];
        if (valor === undefined || valor === null || String(valor).trim() === '') {
          alert(`Atenção: O apartamento ${apto} possui foto ou registro mas está sem a leitura digitada. Preencha antes de enviar!`);
          return; // Bloqueia o envio
        }
      }
    }

    // 2. Análise Automática de Utilitários (Offline-First UX)
    const tipo = String(leitura?.tipoLeitura || leitura?.tipo_leitura || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (tipo.includes('somente agua') || tipo === 'agua') {
      executeExport('agua');
    } else if (tipo.includes('somente gas') || tipo === 'gas') {
      executeExport('gas');
    } else if (tipo.includes('energia')) {
      executeExport('energia');
    } else {
      // Caso Misto (Água e Gás) ou indefinido, abre o modal de opções
      setIsExportModalOpen(true);
    }
  };

  const executeExport = async (scope) => {
    setIsExportModalOpen(false);

    // Suporta 'agua', 'gas', 'energia', 'todos' ou faz fallback para a aba ativa
    const servico = (scope && ['agua', 'gas', 'energia', 'todos'].includes(scope)) 
      ? scope 
      : tipoMedicaoAtivo;
    
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
      alert('Ocorreu um erro ao salvar as leituras. Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  const handleLimparMes = async () => {
    setIsExportModalOpen(false);

    const isConfirmed = await customConfirm(
      'Deseja realmente finalizar o mês e LIMPAR todas as leituras da tela deste condomínio? Esta ação o preparará para o próximo ciclo.',
      'Limpar Condomínio'
    );

    if (!isConfirmed) return;

    const condId = leitura?.id || leitura?.condominio_id;
    try {
      await resetarEstadoLeiturasAtivas(condId);
      alert('Condomínio limpo e finalizado com sucesso! Pronto para o próximo mês.');
      onClose();
    } catch (err) {
      alert('Erro ao limpar condomínio: ' + err.message);
    }
  };


  // 3. TRAVA DE SEGURANÇA (APÓS TODOS OS HOOKS)
  if (!isOpen || !leitura) return null;

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
                  {['agua', 'gas', 'energia'].map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      className={`btn-medicao-toggle ${tipoMedicaoAtivo === tipo ? `active-${tipo}` : ''}`}
                      onClick={() => setTipoMedicaoAtivo(tipo)}
                    >
                      {tipo.toUpperCase()}
                    </button>
                  ))}
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
                    <button
                      key={apto}
                      type="button"
                      className={`btn-apto-simples ${concluido ? 'concluido' : ''}`}
                      onPointerDown={() => startLongPress(apto, concluido)}
                      onPointerUp={() => cancelLongPress(apto, thumbnail)}
                      onPointerCancel={() => cancelLongPress(apto, thumbnail)}
                      onPointerLeave={() => {
                        // Cancela só se o dedo sair, sem forçar clique acidental
                        setPressedApto(null);
                        if (longPressRef.current) {
                          clearTimeout(longPressRef.current);
                          longPressRef.current = null;
                        }
                      }}
                    >
                      <span className="apto-number">{apto}</span>
                      {concluido ? (
                        <div className="concluido-container">
                          {thumbnail ? (
                            <img 
                              src={thumbnail} 
                              alt="Preview" 
                              className="unit-miniature" 
                              style={{ opacity: pressedApto === apto ? 0.5 : 1, transition: 'opacity 0.2s' }}
                            />
                          ) : (
                            <div className="unit-sync-done-icon">
                              <CheckCircle size={22} color="#16a34a" />
                            </div>
                          )}
                          <div className="concluido-label">
                            <CheckCircle size={12} />
                            ✓ {tipoMedicaoAtivo.toUpperCase()} OK
                          </div>
                        </div>
                      ) : (
                        <div className="camera-placeholder">
                          <CameraIcon size={20} />
                          <span>Fotografar</span>
                        </div>
                      )}
                    </button>
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
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        imageUri={fotosCapturadas[activeApto]?.[tipoMedicaoAtivo]}
        unitInfo={`${activeApto} - ${tipoMedicaoAtivo.toUpperCase()}`}
        onRetake={handleRetakeFoto}
        onDelete={handleExcluirFoto}
        onSaveReading={handleSaveReading}
        initialValue={leiturasValores[activeApto]?.[tipoMedicaoAtivo] || ''}
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
