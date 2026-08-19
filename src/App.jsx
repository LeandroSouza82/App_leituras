import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, DollarSign, FileSpreadsheet, PlusCircle } from 'lucide-react';
import './index.css';
import Header from './components/Header/Header';
import LeituraForm from './components/LeituraForm/LeituraForm';
import LeituraList from './components/LeituraList/LeituraList';
import AlertaBanner from './components/AlertaBanner/AlertaBanner';
import BottomNavbar from './components/BottomNavbar/BottomNavbar';
import SplashScreen from './components/SplashScreen/SplashScreen';
import AReceberModal from './components/AReceberModal/AReceberModal';
import { useLeituras } from './hooks/useLeituras';
import { NotificationService } from './services/notificationService';
import ModalAviso from './components/ModalAviso/ModalAviso';
import ListaCondominiosModal from './components/ListaCondominiosModal/ListaCondominiosModal';
import ProgressoModal from './components/ProgressoModal/ProgressoModal';
import { atualizarBadgeIcone } from './utils/appBadge';
import Toast, { useToast } from './components/Toast/Toast';
import Perfil from './pages/Perfil/Perfil';
import Login from './components/Login';
import { supabase } from './services/supabase';
import { useOfflineSync } from './hooks/useOfflineSync';
import { ShareIntentService } from './services/shareIntentService';
import { UCondoImportService } from './services/ucondoImportService';
import { Filesystem, Directory } from '@capacitor/filesystem';
import AutoSyncIndicator from './components/AutoSyncIndicator/AutoSyncIndicator';
import { iniciarObservadorRede } from './services/syncService';

const MainApp = ({ onLogout }) => {
  const [abaAtiva, setAbaAtiva] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCondominiosAberto, setModalCondominiosAberto] = useState(false);
  const [showProgressoModal, setShowProgressoModal] = useState(false);
  const [showAReceberModal, setShowAReceberModal] = useState(false);
  const [focarAtrasadoAuto, setFocarAtrasadoAuto] = useState(false);
  const { toast, showToast, dismissToast } = useToast();
  const {
    leituras,
    mesAnoFormatado,
    totalValor,
    totalConcluidos,
    percentualConcluido,
    leiturasHoje,
    leiturasAtrasadas,
    adicionarLeitura,
    adicionarEmLote,
    toggleCompleto,
    deletarLeitura,
    editarLeitura,
    recarregarCondominios,
  } = useLeituras(showToast);
  const { isOnline, pendentesCount, salvarLeituraOffline } = useOfflineSync();
  const notificacaoEnviadaRef = useRef(false);
  const totalPendentes = useMemo(() => leiturasHoje.length + leiturasAtrasadas.length, [leiturasHoje, leiturasAtrasadas]);

  const handleAdicionarLeitura = async (dados) => {
    if (!isOnline) {
      const salvo = salvarLeituraOffline({
        ...dados,
        completo: false,
        origem: 'offline',
      });

      if (salvo) {
        showToast('Leitura salva localmente. Ela será sincronizada quando a conexão voltar.', 'success');
      } else {
        showToast('Não foi possível guardar a leitura localmente. Tente novamente.', 'error');
      }

      setAbaAtiva('leituras');
      return;
    }

    const leituraSalva = await adicionarLeitura(dados);
    if (!leituraSalva) {
      const salvo = salvarLeituraOffline({
        ...dados,
        completo: false,
        origem: 'offline',
      });

      if (salvo) {
        showToast('O envio falhou, mas a leitura foi salva localmente e será sincronizada depois.', 'warning');
      }
    }

    setAbaAtiva('leituras');
  };

  const handleImportSuccess = (quantidade) => {
    showToast(`${quantidade} condomínios importados com sucesso!`);
    setAbaAtiva('leituras');
  };

  useEffect(() => {
    // Inicializa o observador de conectividade para sincronização automática
    iniciarObservadorRede();

    // Solicita permissão ao iniciar o app
    NotificationService.requestPermissions();

    // Inicializa o serviço de recebimento de planilhas via Share Intent (WhatsApp, Arquivos, etc.)
    ShareIntentService.init(async (fileData) => {
      try {
        showToast(`Planilha recebida via compartilhamento! Processando...`, 'info');

        // fileData.data já contém o ArrayBuffer ou Base64 correto!
        if (fileData?.data) {
          let condominiosExistentes = [];
          if (supabase) {
            try {
              const { data: dbData } = await supabase.from('condominios').select('id, nome');
              condominiosExistentes = dbData || [];
            } catch (_) {}
          }

          const resultado = await UCondoImportService.processarPlanilhaCadastro(
            fileData.name,
            fileData.data,
            condominiosExistentes
          );

          if (resultado?.cancelado) {
            showToast('Importação da planilha compartilhada cancelada.', 'info');
            return;
          }

          if (resultado?.tipo === 'atualizado') {
            alert(`✅ ${resultado.totalUnidades} unidades sincronizadas com sucesso para o condomínio "${resultado.condominio.nome}"!`);
            showToast(`Unidades do condomínio "${resultado.condominio.nome}" atualizadas!`, 'success');
            await recarregarCondominios();
            setAbaAtiva('leituras');
          } else if (resultado?.tipo === 'criado') {
            alert(`✅ Condomínio "${resultado.condominio.nome}" e ${resultado.totalUnidades} unidades criados com sucesso!`);
            showToast(`Condomínio "${resultado.condominio.nome}" importado com sucesso!`, 'success');
            await recarregarCondominios();
            setAbaAtiva('leituras');
          }
        }
      } catch (err) {
        console.error('[ShareIntent] Erro ao processar planilha compartilhada:', err);
        alert('Erro ao importar planilha compartilhada: ' + (err?.message || ''));
        showToast('Erro ao importar planilha: ' + (err?.message || ''), 'error');
      }
    });
  }, []);

  useEffect(() => {
    const temPendencias = leiturasHoje.length > 0 || leiturasAtrasadas.length > 0;

    if (!temPendencias) {
      notificacaoEnviadaRef.current = false;
      atualizarBadgeIcone(0);
      return;
    }

    if (!notificacaoEnviadaRef.current) {
      notificacaoEnviadaRef.current = true;
      // Agenda os alarmes/notificações para as leituras pendentes
      NotificationService.scheduleReadings([...leiturasHoje, ...leiturasAtrasadas]);
    }

    atualizarBadgeIcone(totalPendentes);
  }, [leiturasHoje, leiturasAtrasadas, totalPendentes]);

  useEffect(() => {
    const chave = sessionStorage.getItem('leituras-alerta-aberto');
    if (!chave && totalPendentes > 0) {
      setIsModalOpen(true);
    }
  }, [totalPendentes]);

  const handleOpenAlerts = () => {
    setIsModalOpen(true);
    sessionStorage.setItem('leituras-alerta-aberto', 'true');
  };

  const handleCloseAlerts = () => {
    setIsModalOpen(false);
    sessionStorage.setItem('leituras-alerta-aberto', 'true');
  };

  const handleNavegarParaAtrasados = () => {
    setAbaAtiva('leituras');
    setFocarAtrasadoAuto(true);
  };

  return (
    <>
      <div className="app-shell app-has-navigation">
        <div className={`offline-banner ${isOnline ? 'online' : 'offline'}`}>
          {isOnline
            ? 'Conectado'
            : 'Offline - Sincronização pendente para o banco de dados'}
          {pendentesCount > 0 && <span> · {pendentesCount} pendente{pendentesCount > 1 ? 's' : ''}</span>}
        </div>

        {abaAtiva === 'dashboard' && (
          <>
            <Header
              mesAnoFormatado={mesAnoFormatado}
              totalCondominios={leituras.length}
              totalConcluidos={totalConcluidos}
              percentualConcluido={percentualConcluido}
              totalValor={totalValor}
              leituras={leituras}
              totalPendentes={totalPendentes}
              onOpenAlerts={handleOpenAlerts}
              onOpenProgressoModal={() => setShowProgressoModal(true)}
              onSync={recarregarCondominios}
            />
            <section className="dashboard-summary">
              <AlertaBanner
                leiturasHoje={leiturasHoje}
                leiturasAtrasadas={leiturasAtrasadas}
                onFocarAtrasado={handleNavegarParaAtrasados}
              />
              <div className="dashboard-grid">
                <article
                  className="metric-card metric-blue"
                  onClick={() => setModalCondominiosAberto(true)}
                  style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div className="metric-icon">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <p>Total de Condomínios</p>
                    <strong>{leituras.length}</strong>
                  </div>
                </article>

                <article className="metric-card metric-green">
                  <div className="metric-icon">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p>Concluídos no mês</p>
                    <strong>{totalConcluidos}</strong>
                  </div>
                </article>

                <article
                  className="metric-card metric-gold"
                  onClick={() => setShowAReceberModal(true)}
                  style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div className="metric-icon">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <p>A receber / Faturado</p>
                    <strong>R$ {totalValor.toFixed(2).replace('.', ',')}</strong>
                  </div>
                </article>
              </div>

              <div
                className="completion-card"
                onClick={() => setShowProgressoModal(true)}
                style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div className="completion-header">
                  <div>
                    <h3>Progresso do mês</h3>
                    <p>{percentualConcluido}% concluído</p>
                  </div>
                  <strong>{totalConcluidos}/{leituras.length}</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${percentualConcluido}%` }} />
                </div>
              </div>
            </section>
          </>
        )}

        {abaAtiva === 'leituras' && (
          <div className="app-content">
            <LeituraList
              leituras={leituras}
              leiturasHoje={leiturasHoje}
              leiturasAtrasadas={leiturasAtrasadas}
              onToggle={toggleCompleto}
              onDelete={deletarLeitura}
              onEdit={editarLeitura}
              focarAtrasadoAuto={focarAtrasadoAuto}
              onResetFocarAtrasadoAuto={() => setFocarAtrasadoAuto(false)}
            />
          </div>
        )}

        {abaAtiva === 'cadastrar' && (
          <div className="app-content">
            <LeituraForm
              adicionarLeitura={handleAdicionarLeitura}
              adicionarEmLote={adicionarEmLote}
              onImportSuccess={handleImportSuccess}
              onRecarregarCondominios={recarregarCondominios}
            />
          </div>
        )}

        {abaAtiva === 'perfil' && (
          <Perfil
            onShowToast={showToast}
            onNavigate={setAbaAtiva}
            onRefresh={() => recarregarCondominios()}
            onLogout={onLogout}
          />
        )}

        <ModalAviso
          isOpen={isModalOpen}
          onClose={handleCloseAlerts}
          leiturasHoje={leiturasHoje}
          leiturasAtrasadas={leiturasAtrasadas}
          onNavigateToLeituras={handleNavegarParaAtrasados}
        />

        <ListaCondominiosModal
          isOpen={modalCondominiosAberto}
          onClose={() => setModalCondominiosAberto(false)}
          leituras={leituras}
        />

        <ProgressoModal
          isOpen={showProgressoModal}
          onClose={() => setShowProgressoModal(false)}
          leituras={leituras}
        />

        <AReceberModal
          isOpen={showAReceberModal}
          onClose={() => setShowAReceberModal(false)}
          leituras={leituras}
          totalValor={totalValor}
        />

        <BottomNavbar activeTab={abaAtiva} onChange={setAbaAtiva} />
      </div>
      <AutoSyncIndicator />
      <Toast {...toast} onClose={dismissToast} />
    </>
  );
};

const App = () => {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleLoginSuccess = useCallback((nextSession) => {
    setSession(nextSession);
  }, []);

  const handleLogout = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return false;
      }
    }

    sessionStorage.removeItem('leituras-alerta-aberto');
    Object.keys(localStorage)
      .filter((key) => key.startsWith('leiturasapp:'))
      .forEach((key) => localStorage.removeItem(key));
    setSession(null);
    setShowSplash(true);
    return true;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false);
      return undefined;
    }

    let isMounted = true;

    const loadSession = async () => {
      try {
        const { data: { session: currentSession } = {}, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (isMounted) {
          setSession(currentSession ?? null);
        }
      } catch (err) {
        const mensagem = String(err?.message || '');
        const offlineByNetwork = mensagem.includes('Failed to fetch')
          || mensagem.includes('fetch')
          || mensagem.includes('network')
          || !navigator.onLine;

        if (offlineByNetwork) {
          if (isMounted) {
            setSession((previousSession) => previousSession ?? null);
          }
          return;
        }

        if (isMounted) {
          setSession(null);
        }
      } finally {
        if (isMounted) {
          setLoadingSession(false);
        }
      }
    };

    loadSession();

    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (isMounted) {
        if (nextSession) {
          setSession(nextSession);
        } else if (event === 'SIGNED_OUT') {
          // Apenas zera a sessão se o logout foi disparado de forma explícita pelo usuário
          setSession(null);
        } else if (!navigator.onLine) {
          // Mantém a sessão local em caso de oscilação ou reconexão de rede
          console.warn('[Auth] Oscilação de rede detectada. Mantendo sessão ativa localmente.');
        }
        setLoadingSession(false);
      }
    });

    return () => {
      isMounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  if (!session) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <MainApp onLogout={handleLogout} />;
};

export default App;
