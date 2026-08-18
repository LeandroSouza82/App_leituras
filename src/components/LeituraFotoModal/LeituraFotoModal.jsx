import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Camera as CameraIcon, X, CheckCircle, Share2, Settings } from 'lucide-react';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { LeituraService } from '../../services/leituraService';
import { CameraService } from '../../services/cameraService';
import { getUnidadesOffline } from '../../data/unidadesLocais';
import ModalGerenciarUnidades from '../ModalGerenciarUnidades/ModalGerenciarUnidades';
import PreviewFotoModal from '../PreviewFotoModal/PreviewFotoModal';
import { StorageService } from '../../services/storageService';
import { ImageStampService } from '../../services/imageStampService';
import { supabase } from '../../services/supabase';
import { Network } from '@capacitor/network';
import { salvarLeituraOffline } from '../../services/syncService';
import CustomCamera from '../CustomCamera/CustomCamera';
import './LeituraFotoModal.css';

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
  const toastTimeoutRef = useRef(null);

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
              console.log('[Offline] Unidades carregadas do Filesystem');
            }
          } catch (fsError) {
            console.log('[Offline] Arquivo JSON não encontrado, tentando localStorage...');
          }

          // 3. Fallback para localStorage se FS falhar
          if (unidadesParaCarregar.length === 0) {
            const salvas = localStorage.getItem(storageKey);
            if (salvas) {
              unidadesParaCarregar = JSON.parse(salvas);
              console.log('[Offline] Unidades carregadas do localStorage');
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
              console.log('[Online] Unidades carregadas do Supabase');
            }
          }

          // 5. Último recurso: Lista offline padrão
          if (unidadesParaCarregar.length === 0) {
            const locais = getUnidadesOffline(leitura.nome);
            if (locais) {
              unidadesParaCarregar = locais;
              console.log('[Default] Unidades carregadas do registro offline estático');
            }
          }

          setUnidadesAtualizadas(unidadesParaCarregar);
        } catch (error) {
          console.error('Erro no carregamento inicial da modal:', error);
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
        console.error('Erro ao processar unidade:', unidade, err);
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
      console.log('[FileSystem] Iniciando varredura na raiz do Directory.Data');

      // Varredura direta na raiz via StorageService
      const files = await StorageService.listFiles(`leitura_foto_${leitura.id}_`);

      console.log('[FileSystem] Fotos encontradas para este condomínio:', files.length);

      const capturadas = {};
      const valoresSalvos = {};

      for (const fileName of files) {
        // leitura_foto_condoId_unidade_servico_timestamp.jpg
        const partes = fileName.replace('.jpg', '').split('_');
        if (partes.length >= 6) {
          const unidade = partes[3];
          const servico = partes[4].toLowerCase();

          try {
            // Obtém URI do arquivo no disco sem carregar Base64 gigante na RAM
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
            console.error('Erro ao obter URI da foto:', fileName, readErr);
          }
        }
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
        console.warn('[LeituraFotoModal] Erro ao ler memória de concluídos do localStorage:', e);
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

  const handleExcluirFoto = async () => {
    if (!window.confirm('Deseja realmente excluir esta foto e as evidências locais?')) return;

    try {
      const unidadeId = String(activeApto).trim();
      // 1. CORREÇÃO CRÍTICA: Forçar maiúsculo para bater EXATAMENTE com o arquivo salvo no Android
      const tipoServico = tipoMedicaoAtivo.toUpperCase();

      // 2. BUSCA ABRANGENTE: Pega TODOS os arquivos dessa unidade
      const files = await StorageService.listFiles(`leitura_foto_${leitura.id}_${unidadeId}_`);

      let deletados = 0;
      for (const file of files) {
        // Verifica se o arquivo pertence a este serviço (ex: AGUA), ignorando maiúsculas/minúsculas
        if (file.toLowerCase().includes(tipoServico.toLowerCase())) {
          await StorageService.deleteFile(file);
          console.log('[ExcluirFoto] Fantasma destruído fisicamente:', file);
          deletados++;
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
        console.warn('[ExcluirFoto] Erro ao limpar pendências:', storageErr);
      }

      // 4. Tenta remover do Supabase (falha não bloqueia)
      if (supabase) {
        try {
          await supabase.from('leituras_detalhes').delete().match({
            unidade_id: unidadeId,
            servico: tipoServico,
          });
        } catch (supaErr) {
          console.error("Erro ao deletar no Supabase:", supaErr);
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
        }
        return novo;
      });

      setIsPreviewOpen(false);

      // Feedback opcional para você ver que funcionou:
      console.log(`Sucesso: ${deletados} arquivo(s) removido(s) do aparelho.`);

    } catch (error) {
      alert('Erro ao excluir foto: ' + error.message);
    }
  };

  const handleSaveReading = async (valor) => {
    try {
      const unidadeId = String(activeApto).trim();
      const fotoUrl = fotosCapturadas[unidadeId]?.[tipoMedicaoAtivo];

      if (!valor) {
        throw new Error('Valor da leitura ausente.');
      }

      const servicoKey = tipoMedicaoAtivo.toLowerCase();

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

      // Busca arquivo local da foto no disco
      const prefixoChave = `leitura_foto_${leitura.id}_${unidadeId}_${tipoMedicaoAtivo.toUpperCase()}`;
      const files = await StorageService.listFiles(prefixoChave);
      const localFileName = files.length > 0 ? files[0] : null;

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
        unidade_id: unidadeId,
        servico: tipoMedicaoAtivo.toUpperCase(),
        leitura_atual: parseFloat(String(valor).replace(',', '.')),
        leiturista_id: activeUserId,
        data_leitura: new Date().toISOString(),
        fileName: localFileName
      };

      // 1. Verifica status de conectividade em tempo real
      let isOnline = false;
      try {
        const netStatus = await Network.getStatus();
        isOnline = !!netStatus.connected;
      } catch {
        isOnline = navigator.onLine;
      }

      // 2. SE ONLINE: Tenta envio direto ao Supabase (Storage + DB)
      let syncedDirectly = false;
      if (isOnline && supabase) {
        window.dispatchEvent(new CustomEvent('syncStatus', { detail: { syncing: true } }));
        try {
          let fotoUrlSupabase = fotoUrl;

          // Se tem arquivo local, faz upload para o Storage do Supabase
          if (localFileName) {
            const rawData = await StorageService.readFile(localFileName);
            if (rawData) {
              const byteCharacters = atob(rawData);
              const byteNumbers = new Uint8Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const blob = new Blob([byteNumbers], { type: 'image/jpeg' });
              const remotePath = `leituras/${Date.now()}_${localFileName}`;

              const { error: uploadError } = await supabase.storage
                .from('fotos_leituras')
                .upload(remotePath, blob, { contentType: 'image/jpeg', upsert: true });

              if (!uploadError) {
                const { data: publicUrlData } = supabase.storage
                  .from('fotos_leituras')
                  .getPublicUrl(remotePath);
                fotoUrlSupabase = publicUrlData?.publicUrl || fotoUrl;
              }
            }
          }

          const { error: dbError } = await supabase
            .from('leituras_detalhes')
            .insert([{
              ...payload,
              foto_url: fotoUrlSupabase || ''
            }]);

          if (!dbError) {
            syncedDirectly = true;
            console.log('[LeituraFotoModal] Leitura sincronizada diretamente com o Supabase. Foto física preservada no disco.');
            window.dispatchEvent(new CustomEvent('leiturasAtualizadas'));
          } else {
            console.warn('[LeituraFotoModal] Erro no insert do DB, salvando na fila offline:', dbError.message);
          }
        } catch (syncErr) {
          console.warn('[LeituraFotoModal] Falha no sync direto, direcionando para fila offline:', syncErr.message);
        } finally {
          window.dispatchEvent(new CustomEvent('syncStatus', { detail: { syncing: false } }));
        }
      }

      // 3. SE OFFLINE ou se o envio direto falhou por instabilidade:
      // Enfileira automaticamente via salvarLeituraOffline
      if (!syncedDirectly) {
        await salvarLeituraOffline(payload, null, localFileName);
        console.log('[LeituraFotoModal] Leitura salva na fila offline para sincronização automática em background.');
        
        // ✅ Feedback visual: exibe o toast verde APENAS se estiver offline
        if (!isOnline) {
          exibirToastSucesso();
        }
      }

    } catch (error) {
      console.error('Erro ao salvar leitura:', error);
      alert('❌ Erro inesperado ao salvar: ' + error.message);
    }
  };

  // Abre a câmera customizada in-app (CustomCamera) em vez da câmera nativa do SO
  const handleDispararCamera = (aptoAlvo) => {
    const apto = aptoAlvo || activeApto;
    if (!apto || isProcessing) return;
    setActiveApto(apto);
    setCustomCameraOpen(true);
  };

  // Callback chamado pelo CustomCamera após captura bem-sucedida (base64 comprimido)
  const handleCameraCapture = async (base64) => {
    setCustomCameraOpen(false);

    const apto = activeApto;
    if (!apto) return;

    try {
      setIsProcessing(true);

      const unidadeId = String(apto).trim();
      const tipoServico = tipoMedicaoAtivo.toUpperCase();
      const servicoKey = tipoMedicaoAtivo.toLowerCase();

      // Nome exclusivo baseado em timestamp e ID (Salvamento Plano na Raiz)
      const fileName = `leitura_foto_${leitura.id}_${unidadeId}_${tipoServico}_${Date.now()}.jpg`;

      // 1. Aplica carimbo de data/hora via Canvas (já aceita base64 puro)
      let stampedBase64 = await ImageStampService.applyTimestamp(
        `data:image/jpeg;base64,${base64}`
      );

      // 2. Salva no Directory.Data e obtém webUrl (sem manter base64 no state)
      const savedFile = await CameraService.salvarFotoNaRaiz(stampedBase64, fileName);

      // 3. Limpeza imediata do base64 da RAM
      stampedBase64 = null;

      // 4. Grava marcação de conclusão persistente
      localStorage.setItem(`concluido_${leitura.id}_${unidadeId}_${servicoKey}`, 'true');

      setConcluidosMemoria((prev) => ({
        ...prev,
        [unidadeId]: {
          ...(prev[unidadeId] || {}),
          [servicoKey]: true
        }
      }));

      // 5. Atualiza estado visual usando URI convertida (sem base64 no state)
      setFotosCapturadas((prev) => ({
        ...prev,
        [unidadeId]: {
          ...(prev[unidadeId] || {}),
          [tipoMedicaoAtivo]: savedFile.webUrl
        }
      }));

      // 6. Abre PreviewFotoModal para digitação da leitura
      setIsPreviewOpen(true);
      console.log('[CustomCamera] Foto persistida e direcionada para PreviewFotoModal:', savedFile.path);

    } catch (error) {
      console.error('[CustomCamera] Erro ao processar foto capturada:', error);
      alert('❌ Erro ao processar foto: ' + (error?.message || error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetakeFoto = async () => {
    try {
      const unidadeId = String(activeApto).trim();
      const tipoServico = tipoMedicaoAtivo.toUpperCase();
      const servicoKey = tipoMedicaoAtivo.toLowerCase();

      // 1. Deleta o arquivo físico antigo do disco
      const prefixoChave = `leitura_foto_${leitura.id}_${unidadeId}_${tipoServico}`;
      const files = await StorageService.listFiles(prefixoChave);
      for (const file of files) {
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
        console.warn('[Retake] Erro ao limpar fila:', err);
      }

      // 3. Limpa no Supabase se possível (sem travar a UI se offline)
      if (supabase) {
        try {
          await supabase.from('leituras_detalhes').delete().match({
            unidade_id: unidadeId,
            servico: tipoServico,
          });
        } catch (supaErr) {
          console.warn('[Retake] Erro ao deletar no Supabase:', supaErr?.message);
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
      console.error('[Retake] Erro ao refazer foto:', err);
      setIsPreviewOpen(false);
      handleDispararCamera(activeApto);
    }
  };

  const handleExportar = async () => {
    const todos = window.confirm(`Deseja exportar apenas as leituras de ${tipoMedicaoAtivo.toUpperCase()}? (Clique em "Cancelar" para exportar TODOS os serviços consolidados)`);

    setExportando(true);
    const sucesso = await LeituraService.exportarParaWhatsApp(leitura, todos ? tipoMedicaoAtivo : 'todos');
    if (sucesso) {
      alert('Dados exportados com sucesso!');
    }
    setExportando(false);
  };

  // 3. TRAVA DE SEGURANÇA (APÓS TODOS OS HOOKS)
  if (!isOpen || !leitura) return null;

  return (
    <div
      className="foto-modal-overlay"
      onClick={onClose}
      style={customCameraOpen ? { visibility: 'hidden' } : undefined}
    >
      <div className="foto-modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="foto-modal-header">
          <div className="foto-modal-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3>{leitura.nome}</h3>
              <button
                type="button"
                className="btn-settings-units"
                onClick={() => setIsManageModalOpen(true)}
                title="Configurar Unidades"
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
              <button type="button" onClick={() => setIsManageModalOpen(true)}>
                ⚙️ Configurar / Importar Unidades
              </button>
            </div>
          )}
          <div className="apartamentos-grid">
            {unidadesExibidas.map((apto) => {
              const status = fotosCapturadas[apto] || {};
              const thumbnail = status[tipoMedicaoAtivo];
              const concluido = Boolean(thumbnail || concluidosMemoria[apto]?.[tipoMedicaoAtivo]);

              return (
                <button
                  key={apto}
                  type="button"
                  className={`btn-apto-simples ${concluido ? 'concluido' : ''}`}
                  onClick={() => handleUnitClick(apto, thumbnail)}
                >
                  <span className="apto-number">{apto}</span>
                  {concluido ? (
                    <div className="concluido-container">
                      {thumbnail ? (
                        <img src={thumbnail} alt="Preview" className="unit-miniature" />
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
              <Share2 size={18} />
              {exportando ? 'Processando...' : `Salvar Leituras (${unidadesConcluidasCount}/${unidadesExibidas.length})`}
            </button>
            <button type="button" className="btn-cancelar-foto" onClick={onClose}>
              Fechar
            </button>
          </div>
        </footer>
      </div>

      <ModalGerenciarUnidades
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        condominioId={leitura.id}
        condominioNome={leitura.nome}
        onUnidadesAtualizadas={(novas) => setUnidadesAtualizadas(novas)}
      />

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

      {showToast && (
        <div className="toast-success-top">
          <CheckCircle size={18} />
          <span>Salvo offline com sucesso!</span>
        </div>
      )}
      {/* Câmera customizada in-app — renderizada fora dos modais para z-index correto */}
      {customCameraOpen && (
        <CustomCamera
          onCapture={handleCameraCapture}
          onClose={() => setCustomCameraOpen(false)}
        />
      )}
    </div>
  );
};

export default LeituraFotoModal;
