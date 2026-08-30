import { customAlert, customConfirm } from './components/CustomPrompt/CustomPrompt';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, DollarSign, FileSpreadsheet, PlusCircle, FolderSync } from 'lucide-react';
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
import { hidratarCacheLeiturasOffline } from './services/leiturasAnterioresService';
import Perfil from './pages/Perfil/Perfil';
import Login from './components/Login';
import { supabase } from './services/supabase';
import { useOfflineSync } from './hooks/useOfflineSync';
import { ShareIntentService } from './services/shareIntentService';
import { UCondoImportService } from './services/ucondoImportService';
import { Filesystem, Directory } from '@capacitor/filesystem';
import AutoSyncIndicator from './components/AutoSyncIndicator/AutoSyncIndicator';
import { iniciarObservadorRede } from './services/syncService';
import BackupFotosMenu from './components/BackupFotosMenu/BackupFotosMenu';
import { Capacitor } from '@capacitor/core';
import { logoutGoogleNativo } from './services/googleAuthService';
import { LocalNotifications } from '@capacitor/local-notifications';

const MainApp = ({ onLogout }) => {
  const [abaAtiva, setAbaAtiva] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCondominiosAberto, setModalCondominiosAberto] = useState(false);
  const [showProgressoModal, setShowProgressoModal] = useState(false);
  const [showAReceberModal, setShowAReceberModal] = useState(false);
  const [showBackupFotosModal, setShowBackupFotosModal] = useState(false);
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

    // Rotina de Hidratação Global de Descida (Sync Down)
    // Substitui o cache sujo/incompleto pelo espelho real da nuvem (Unidades e Leituras Anteriores)
    hidratarCacheLeiturasOffline();

    // Solicita permissão ao iniciar o app
    NotificationService.requestPermissions();

    // Restauração silenciosa das leituras anteriores do Supabase -> localStorage
    // CICLO CONTÍNUO: Prioriza leituras_detalhes (coletadas pelo app) para o próximo mês.
    // Fallback para unidades_leituras (planilhas importadas) para novos condomínios.
    const restaurarLeiturasDaNuvem = async () => {
      try {
        if (!supabase) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;

        // ── Etapa 1: Ciclo contínuo – busca a ÚLTIMA leitura de cada unidade
        // coletada pelo próprio app (leituras_detalhes). Isso torna o sistema
        // 100% autossustentável: a leitura atual do mês vira a anterior do próximo.
        const { data: detalhes, error: errDetalhes } = await supabase
          .from('leituras_detalhes')
          .select('unidade_id, condominio_nome, servico, leitura_atual, data_leitura')
          .eq('leiturista_id', user.id)
          .order('data_leitura', { ascending: false });

        // Mapa de chave "condId__servico" -> array de leituras (deduplicado por unidade)
        const gruposApp = {};

        if (!errDetalhes && Array.isArray(detalhes) && detalhes.length > 0) {
          // Deduplicar: mantém apenas o registro mais recente por unidade+serviço
          const vistos = new Set();
          for (const reg of detalhes) {
            const condId = reg.condominio_nome; // guarda condominio_id
            const servico = (reg.servico || 'AGUA').toUpperCase();
            const chaveUnidade = `${condId}__${servico}__${String(reg.unidade_id).trim()}`;

            if (vistos.has(chaveUnidade)) continue; // já tem registro mais recente
            vistos.add(chaveUnidade);

            const chaveGrupo = `${condId}__${servico}`;
            if (!gruposApp[chaveGrupo]) gruposApp[chaveGrupo] = { condId, servico, leituras: [] };
            gruposApp[chaveGrupo].leituras.push({
              unidade: String(reg.unidade_id).trim(),
              leitura_anterior: reg.leitura_atual, // atual de hoje = anterior do próximo mês
            });
          }
        }

        // ── Etapa 2: Fallback – planilhas importadas (unidades_leituras)
        // Cobre condomínios ainda não operados pelo app ou recém-cadastrados.
        const { data: planilhas, error: errPlanilhas } = await supabase
          .from('unidades_leituras')
          .select('condominio_nome, unidade, leitura_anterior, servico')
          .eq('leiturista_id', user.id);

        const gruposPlanilha = {};
        if (!errPlanilhas && Array.isArray(planilhas) && planilhas.length > 0) {
          for (const reg of planilhas) {
            const condId = reg.condominio_nome;
            const servico = (reg.servico || 'AGUA').toUpperCase();
            const chaveGrupo = `${condId}__${servico}`;
            // Só usa planilha se o app ainda não tem dados do ciclo contínuo
            if (gruposApp[chaveGrupo]) continue;
            if (!gruposPlanilha[chaveGrupo]) gruposPlanilha[chaveGrupo] = { condId, servico, leituras: [] };
            gruposPlanilha[chaveGrupo].leituras.push({
              unidade: reg.unidade,
              leitura_anterior: reg.leitura_anterior,
            });
          }
        }

        // ── Etapa 3: Persiste no localStorage
        // Dados do ciclo do app SEMPRE sobrescrevem (são mais recentes).
        // Dados de planilha só gravam se a chave ainda estiver vazia.
        const todosGrupos = [
          ...Object.values(gruposApp).map(g => ({ ...g, sobrescrever: true })),
          ...Object.values(gruposPlanilha).map(g => ({ ...g, sobrescrever: false })),
        ];

        for (const { condId, servico, leituras, sobrescrever } of todosGrupos) {
          const storageKey = `leituras_anteriores_${condId}_${servico}`;
          if (sobrescrever || !localStorage.getItem(storageKey)) {
            localStorage.setItem(storageKey, JSON.stringify(leituras));
          }
        }
      } catch (_) {
        // Falha silenciosa — offline ou sem permissão
      }
    };

    restaurarLeiturasDaNuvem();

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
            await customAlert(`✅ ${resultado.totalUnidades} unidades sincronizadas com sucesso para o condomínio "${resultado.condominio.nome}"!`);
            showToast(`Unidades do condomínio "${resultado.condominio.nome}" atualizadas!`, 'success');
            await recarregarCondominios();
            setAbaAtiva('leituras');
          } else if (resultado?.tipo === 'criado') {
            await customAlert(`✅ Condomínio "${resultado.condominio.nome}" e ${resultado.totalUnidades} unidades criados com sucesso!`);
            showToast(`Condomínio "${resultado.condominio.nome}" importado com sucesso!`, 'success');
            await recarregarCondominios();
            setAbaAtiva('leituras');
          }
        }
      } catch (err) {
        await customAlert('Erro ao importar planilha compartilhada: ' + (err?.message || ''));
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
        {!isOnline && (
          <div className={`offline-banner offline`}>
            Offline - Sincronização pendente para o banco de dados
            {pendentesCount > 0 && <span> · {pendentesCount} pendente{pendentesCount > 1 ? 's' : ''}</span>}
          </div>
        )}

        {abaAtiva === 'dashboard' && (
          <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#DBEAFE' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: '#2563EB' }}>
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
                onLogout={onLogout}
                onNavigate={setAbaAtiva}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '100px' }}>
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
                      <p>Informações do Condomínio</p>
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

                  <article
                    className="metric-card metric-purple"
                    onClick={() => setShowBackupFotosModal(true)}
                    style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="metric-icon">
                      <FolderSync size={20} />
                    </div>
                    <div>
                      <p>Gerenciar Fotos</p>
                      <strong>Backups</strong>
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
            </div>
          </div>
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
          <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#eff6ff' }}>
            <LeituraForm
              adicionarLeitura={handleAdicionarLeitura}
              adicionarEmLote={adicionarEmLote}
              onImportSuccess={handleImportSuccess}
              onRecarregarCondominios={recarregarCondominios}
            />
          </div>
        )}

        {abaAtiva === 'perfil' && (
          <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#eff6ff' }}>
            <Perfil
              onShowToast={showToast}
              onNavigate={setAbaAtiva}
              onRefresh={() => recarregarCondominios()}
              onLogout={onLogout}
            />
          </div>
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
      <BackupFotosMenu 
        isOpen={showBackupFotosModal} 
        onClose={() => setShowBackupFotosModal(false)} 
      />
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
    if (Capacitor.isNativePlatform()) {
      try {
        await logoutGoogleNativo();
      } catch (err) {
        console.warn('Erro ao deslogar Google Nativo:', err);
      }

      try {
        const pending = await LocalNotifications.getPending();
        if (pending.notifications && pending.notifications.length > 0) {
          const notificationsToCancel = pending.notifications.map(n => ({ id: n.id }));
          await LocalNotifications.cancel({ notifications: notificationsToCancel });
        }
        await LocalNotifications.removeAllDeliveredNotifications();
      } catch (err) {
        console.warn('Erro ao limpar notificações locais:', err);
      }
    }

    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return false;
      }
    }

    sessionStorage.clear();
    localStorage.clear();
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
