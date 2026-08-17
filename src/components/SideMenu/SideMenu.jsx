import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, CheckCircle2, ChevronRight, Layers, AlertCircle, Check } from 'lucide-react';
import './SideMenu.css';
import { sincronizarPendentes, obterTotalPendentes } from '../../services/syncService';

const SideMenu = ({ isOpen, onClose, onSync }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFinished, setSyncFinished] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [progress, setProgress] = useState({ atual: 0, total: 0 });
  const [resultado, setResultado] = useState(null);
  const [pendingCount, setPendingCount] = useState(null);

  const toastTimeoutRef = useRef(null);

  // ─── Ciclo de vida: abertura e fechamento do menu ───────────────────────────
  useEffect(() => {
    if (isOpen) {
      // ABERTURA: zera TODOS os estados visuais transitórios antes de consultar o disco
      setSyncFinished(false);
      setSyncError(false);
      setShowSuccessToast(false);
      setIsSyncing(false);
      setResultado(null);
      setProgress({ atual: 0, total: 0 });

      // Cancela qualquer Toast pendente de sessão anterior
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }

      // Só depois de limpar, lê o total real de pendências do disco/localStorage
      const verificarPendencias = async () => {
        try {
          const total = await obterTotalPendentes();
          setPendingCount(typeof total === 'number' && total >= 0 ? total : 0);
        } catch {
          setPendingCount(0);
        }
      };
      verificarPendencias();
    } else {
      // FECHAMENTO: força reset dos estados visuais de conclusão
      // Isso é necessário no Android onde o componente NÃO desmonta ao fechar,
      // e o estado persiste entre sessões de abertura.
      setSyncFinished(false);
      setSyncError(false);
      setShowSuccessToast(false);
      setProgress({ atual: 0, total: 0 });
      setResultado(null);

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    }
  }, [isOpen]);


  if (!isOpen) return null;

  const handleSyncClick = async () => {
    // ⚠️ TRAVA FÍSICA INCONDICIONAL: bloqueia se fila vazia, já sincronizando OU já concluído
    if (!pendingCount || pendingCount <= 0 || isSyncing || syncFinished) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncFinished(false);
      setShowSuccessToast(false);
      setSyncError(false);
      setResultado(null);
      setProgress({ atual: 0, total: 0 });

      // Executa a sincronização real com callback de progresso em tempo real
      const res = await sincronizarPendentes((atual, total) => {
        setProgress({ atual, total });
      });

      setResultado(res);
      setIsSyncing(false);
      setSyncFinished(true);
      setShowSuccessToast(true);
      
      // Usa pendentesRestantes retornado pelo serviço (já recontou o disco após deletar fotos)
      // Isso garante que pendingCount reflita exatamente o que está no disco/localStorage
      const novoPendingCount = typeof res?.pendentesRestantes === 'number'
        ? res.pendentesRestantes
        : (res?.falhas ?? 0);
      setPendingCount(novoPendingCount);

      // Limpa timeout anterior se houver
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }

      // Toast desaparece automaticamente após 3 segundos
      toastTimeoutRef.current = setTimeout(() => {
        setShowSuccessToast(false);
        // Após o toast, se fila está vazia, remove o estado de 'concluído'
        // para renderizar o card 'Tudo atualizado' definitivamente
        if (novoPendingCount === 0) {
          setSyncFinished(false);
        }
      }, 3000);

      // Notifica o App para atualizar dados locais se houver callback
      if (onSync) {
        await onSync();
      }
    } catch (err) {
      console.error('[SideMenu] Erro fatal na sincronização:', err);
      setSyncError(true);
      setIsSyncing(false);
    }
  };

  // Feedback amigável quando o usuário clica no card já sincronizado (pendingCount === 0)
  const handleZeroClick = () => {
    alert('Tudo certo! Nenhuma leitura nova para sincronizar.');
  };

  const progressPercent =
    progress.total > 0 ? Math.round((progress.atual / progress.total) * 100) : 0;

  const totalLeituras = progress.total || resultado?.enviadas || 0;

  // Estado apagado controlado EXCLUSIVAMENTE por pendingCount === 0 (e fora de estados ativos)
  const isZeroPending = pendingCount === 0 && !isSyncing;

  const getItemClass = () => {
    if (isZeroPending) return 'side-menu-item disabled';
    if (syncError) return 'side-menu-item error';
    if (syncFinished) return 'side-menu-item success finished';
    if (isSyncing) return 'side-menu-item syncing';
    return 'side-menu-item';
  };

  return (
    <div className="side-menu-overlay" onClick={onClose}>
      {/* Toast flutuante no topo da tela */}
      {showSuccessToast && (
        <div className="side-menu-toast-top">
          <span>Enviado com sucesso</span>
        </div>
      )}

      <aside className="side-menu-container" onClick={(e) => e.stopPropagation()}>
        <header className="side-menu-header">
          <div className="side-menu-brand">
            <div className="side-menu-logo">
              <Layers size={22} color="#ffffff" />
            </div>
            <div>
              <h3>Fast Leituras</h3>
              <p>Menu do Aplicativo</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-close-side-menu"
            onClick={onClose}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </header>

        <div className="side-menu-content">
          <div className="side-menu-section-title">Ações e Configurações</div>
          <ul className="side-menu-list">
            <li>
              <button
                type="button"
                className={getItemClass()}
                onClick={isZeroPending ? handleZeroClick : handleSyncClick}
                disabled={isSyncing}
              >
                <div className="side-menu-item-icon">
                  {isZeroPending ? (
                    <Check size={20} className="icon-disabled" />
                  ) : syncError ? (
                    <AlertCircle size={20} color="#dc2626" />
                  ) : syncFinished ? (
                    <CheckCircle2 size={20} color="#16a34a" />
                  ) : (
                    <RefreshCw size={20} className={isSyncing ? 'spin-icon' : ''} />
                  )}
                </div>

                <div className="side-menu-item-info">
                  <strong>{isZeroPending ? 'Tudo atualizado' : 'Sincronizar Dados'}</strong>

                  {isZeroPending ? (
                    <span>Nenhuma leitura pendente para envio.</span>
                  ) : syncFinished ? (
                    <div className="sync-finished-details">
                      <div className="sync-finished-status">
                        <span>Sincronização concluída com sucesso.</span>
                        <CheckCircle2 size={16} className="sync-check-icon" />
                      </div>
                      <span className="sync-finished-subtitle">
                        Todas as {totalLeituras} leituras foram enviadas.
                      </span>
                    </div>
                  ) : syncError ? (
                    <span>Erro na sincronização. Tente novamente.</span>
                  ) : isSyncing ? (
                    <span>
                      {progress.total > 0
                        ? `Enviando ${progress.atual} de ${progress.total} leitura${progress.total > 1 ? 's' : ''}...`
                        : 'Verificando dados pendentes...'}
                    </span>
                  ) : (
                    <span>
                      {pendingCount !== null && pendingCount > 0
                        ? `Você tem ${pendingCount} leitura${pendingCount > 1 ? 's' : ''} aguardando envio.`
                        : 'Atualizar leituras e condomínios'}
                    </span>
                  )}

                  {/* Barra de progresso */}
                  {isSyncing && progress.total > 0 && (
                    <div className="sync-progress-track">
                      <div
                        className="sync-progress-fill"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}

                  {syncFinished && (
                    <div className="sync-progress-track">
                      <div
                        className="sync-progress-fill success-fill"
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                </div>

                {!isZeroPending && !isSyncing && !syncFinished && !syncError && (
                  <ChevronRight size={18} className="side-menu-item-arrow" />
                )}
              </button>
            </li>
          </ul>
        </div>

        <footer className="side-menu-footer">
          <p className="side-menu-version">Versão 1.0.1 • Fast Leituras</p>
        </footer>
      </aside>
    </div>
  );
};

export default SideMenu;
