import React, { useState, useEffect, useMemo } from 'react';
import { Camera as CameraIcon, X, CheckCircle, Share2, Settings } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { LeituraService } from '../../services/leituraService';
import { CameraService } from '../../services/cameraService';
import { getUnidadesOffline, normalizarUnidadeuCondo } from '../../data/unidadesLocais';
import ModalGerenciarUnidades from '../ModalGerenciarUnidades/ModalGerenciarUnidades';
import CameraModal from '../CameraModal/CameraModal';
import PreviewFotoModal from '../PreviewFotoModal/PreviewFotoModal';
import { StorageService } from '../../services/storageService';
import { supabase } from '../../services/supabase';
import './LeituraFotoModal.css';

const LeituraFotoModal = ({ isOpen, onClose, leitura }) => {
  // 1. DECLARAÇÃO DE TODOS OS HOOKS NO TOPO ABSOLUTO
  const [fotosCapturadas, setFotosCapturadas] = useState({});
  const [leiturasValores, setLeiturasValores] = useState({});
  const [exportando, setExportando] = useState(false);
  const [torreAtiva, setTorreAtiva] = useState(null);
  const [tipoMedicaoAtivo, setTipoMedicaoAtivo] = useState('agua');
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeApto, setActiveApto] = useState(null);
  const [unidadesCarregadas, setUnidadesAtualizadas] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

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
              encoding: 'utf8'
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
        const unidadeNormalizada = normalizarUnidadeuCondo(unidade);
        const match = unidadeNormalizada?.match(/^([A-Za-z0-9]+)-/);

        if (match) {
          const prefix = match[1];
          let label = '';
          if (/^\d+$/.test(prefix)) label = `Bloco ${prefix}`;
          else if (prefix.toUpperCase() === 'AP') label = 'Geral';
          else label = `Torre ${prefix}`;

          if (!mapa[label]) mapa[label] = [];
          mapa[label].push(unidadeNormalizada);
        } else {
          if (!mapa['Geral']) mapa['Geral'] = [];
          if (unidadeNormalizada) mapa['Geral'].push(unidadeNormalizada);
        }
      } catch (err) {
        console.error('Erro ao normalizar unidade:', unidade, err);
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
      listaCompleta: listaUnidades.map(u => normalizarUnidadeuCondo(u))
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

  // Contador de conclusões (Movido para fora de condicionais/loops)
  const unidadesConcluidasCount = useMemo(() => {
    return unidadesExibidas.filter(apto => fotosCapturadas[apto]?.[tipoMedicaoAtivo]).length;
  }, [unidadesExibidas, fotosCapturadas, tipoMedicaoAtivo]);

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
            const data = await StorageService.readFile(fileName);

            if (!capturadas[unidade]) capturadas[unidade] = {};
            capturadas[unidade][servico] = `data:image/jpeg;base64,${data}`;

            const localVal = localStorage.getItem(`valor_${leitura.id}_${unidade}_${servico}`);
            if (localVal) {
              if (!valoresSalvos[unidade]) valoresSalvos[unidade] = {};
              valoresSalvos[unidade][servico] = localVal;
            }
          } catch (readErr) {
            console.error('Erro ao ler foto individual:', fileName);
          }
        }
      }
      setFotosCapturadas(capturadas);
      setLeiturasValores(valoresSalvos);
    } catch (ignored) {
      setFotosCapturadas({});
      setLeiturasValores({});
    }
  };

  const handleUnitClick = (apto, thumbnail) => {
    setActiveApto(apto);
    if (thumbnail) {
      setIsPreviewOpen(true);
    } else {
      setIsCameraOpen(true);
    }
  };

  const handleExcluirFoto = async () => {
    if (!window.confirm('Deseja realmente excluir esta foto e as evidências locais?')) return;

    try {
      const unidadeNormalizada = normalizarUnidadeuCondo(activeApto);
      const prefixoChave = `leitura_foto_${leitura.id}_${unidadeNormalizada}_${tipoMedicaoAtivo}`;

      // Localiza o arquivo exato na raiz antes de deletar via StorageService
      const files = await StorageService.listFiles(prefixoChave);

      if (files.length > 0) {
        await StorageService.deleteFile(files[0]);
      }

      if (supabase) {
        try {
          await supabase
            .from('leituras_detalhes')
            .delete()
            .match({
              unidade_id: unidadeNormalizada,
              servico: tipoMedicaoAtivo.toUpperCase(),
            });
        } catch (supaErr) {
          console.error("Erro ao deletar no Supabase:", supaErr);
        }
      }

      localStorage.removeItem(`valor_${leitura.id}_${unidadeNormalizada}_${tipoMedicaoAtivo}`);

      setFotosCapturadas((prev) => {
        const novo = { ...prev };
        if (novo[unidadeNormalizada]) {
          delete novo[unidadeNormalizada][tipoMedicaoAtivo];
          if (Object.keys(novo[unidadeNormalizada]).length === 0) {
            delete novo[unidadeNormalizada];
          }
        }
        return novo;
      });

      setLeiturasValores((prev) => {
        const novo = { ...prev };
        if (novo[unidadeNormalizada]) {
          delete novo[unidadeNormalizada][tipoMedicaoAtivo];
        }
        return novo;
      });

      setIsPreviewOpen(false);
    } catch (error) {
      alert('Erro ao excluir foto: ' + error.message);
    }
  };

  const handleSaveReading = async (valor) => {
    try {
      const unidadeNormalizada = normalizarUnidadeuCondo(activeApto);
      const fotoBase64 = fotosCapturadas[unidadeNormalizada]?.[tipoMedicaoAtivo];

      if (!fotoBase64 || !valor) {
        throw new Error('Foto ou valor da leitura ausentes.');
      }

      localStorage.setItem(`valor_${leitura.id}_${unidadeNormalizada}_${tipoMedicaoAtivo}`, valor);

      setLeiturasValores(prev => ({
        ...prev,
        [unidadeNormalizada]: { ...(prev[unidadeNormalizada] || {}), [tipoMedicaoAtivo]: valor }
      }));

      let synced = false;
      if (supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const activeUserId = user?.id || 'cf720ead-721b-4aa5-b505-9a90ce9202d7';

          const payload = {
            unidade_id: unidadeNormalizada,
            servico: tipoMedicaoAtivo.toUpperCase(),
            leitura_atual: parseFloat(valor),
            foto_url: fotoBase64,
            leiturista_id: activeUserId,
            data_leitura: new Date().toISOString()
          };

          const { error } = await supabase
            .from('leituras_detalhes')
            .insert([payload]);

          if (error) {
            console.error("Erro detalhado no Supabase:", error);
            throw error;
          }
          synced = true;
        } catch (supabaseError) {
          console.warn('Falha na sincronização imediata:', supabaseError.message);
        }
      }

      if (synced) {
        alert(`Leitura de ${unidadeNormalizada} salva e sincronizada!`);
      } else {
        alert(`Leitura de ${unidadeNormalizada} salva offline com sucesso! Será sincronizada quando o banco estiver disponível.`);
      }

    } catch (error) {
      console.error('Erro ao salvar leitura:', error);
      alert('❌ Erro inesperado ao salvar: ' + error.message);
    }
  };

  const handleCapturePhoto = async (photoData) => {
    if (!activeApto || isProcessing) return;

    try {
      setIsProcessing(true);

      const unidadeNormalizada = normalizarUnidadeuCondo(activeApto);
      const tipoServico = tipoMedicaoAtivo.toUpperCase();

      // Nome exclusivo baseado em timestamp e ID (Salvamento Plano na Raiz)
      const fileName = `leitura_foto_${leitura.id}_${unidadeNormalizada}_${tipoServico}_${Date.now()}.jpg`;

      // 1. Salvamento Direto na Raiz do Directory.Data via Base64
      // Isso elimina o erro "Invalid Path" causado por URLs de WebView
      const savedFile = await CameraService.salvarFotoNaRaiz(photoData.base64, fileName);

      // 2. Sucesso: Atualiza estado visual usando o webPath para preview imediato
      setFotosCapturadas((prev) => ({
        ...prev,
        [unidadeNormalizada]: {
          ...(prev[unidadeNormalizada] || {}),
          [tipoMedicaoAtivo]: photoData.webPath
        }
      }));

      setIsPreviewOpen(true);
      console.log('[FileSystem] Foto persistida na raiz:', savedFile.path);

    } catch (error) {
      console.error("[FileSystem] Falha Crítica ao Processar Foto:", error);
      alert('❌ Erro ao salvar evidência: ' + error.message);
    } finally {
      // ⚠️ GARANTIA DE DESTRAVAMENTO DA UI
      setIsProcessing(false);
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
    <div className="foto-modal-overlay" onClick={onClose}>
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
              const concluido = Boolean(thumbnail);

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
                      {typeof thumbnail === 'string' && <img src={thumbnail} alt="Preview" className="unit-miniature" />}
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

      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        unitInfo={`${activeApto} - ${tipoMedicaoAtivo.toUpperCase()}`}
        onCapture={handleCapturePhoto}
      />

      <PreviewFotoModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        imageUri={fotosCapturadas[activeApto]?.[tipoMedicaoAtivo]}
        unitInfo={`${activeApto} - ${tipoMedicaoAtivo.toUpperCase()}`}
        onRetake={() => { setIsPreviewOpen(false); setIsCameraOpen(true); }}
        onDelete={handleExcluirFoto}
        onSaveReading={handleSaveReading}
        initialValue={leiturasValores[activeApto]?.[tipoMedicaoAtivo] || ''}
      />
    </div>
  );
};

export default LeituraFotoModal;
