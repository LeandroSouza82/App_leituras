import { customAlert } from './components/CustomPrompt/CustomPrompt';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, FolderSync } from 'lucide-react';
import './index.css';
import Header from './components/Header/Header';
import LeituraForm from './components/LeituraForm/LeituraForm';
import LeituraList from './components/LeituraList/LeituraList';
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
import LegalConsentGate from './components/LegalConsentGate/LegalConsentGate';
import NotificationPermissionGate from './components/NotificationPermissionGate/NotificationPermissionGate';
import { supabase } from './services/supabase';
import { hasLegalTermsAcceptance } from './services/legalConsentService';
import { useOfflineSync } from './hooks/useOfflineSync';
import { ShareIntentService } from './services/shareIntentService';
import { UCondoImportService } from './services/ucondoImportService';
import AutoSyncIndicator from './components/AutoSyncIndicator/AutoSyncIndicator';
import { iniciarObservadorRede } from './services/syncService';
import BackupFotosMenu from './components/BackupFotosMenu/BackupFotosMenu';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { logoutGoogleNativo } from './services/googleAuthService';
import { LocalNotifications } from '@capacitor/local-notifications';

const MainApp = ({ onLogout, pendingNotificationAction, onNotificationActionHandled }) => {
  const [abaAtiva, setAbaAtiva] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCondominiosAberto, setModalCondominiosAberto] = useState(false);
  const [showProgressoModal, setShowProgressoModal] = useState(false);
  const [showAReceberModal, setShowAReceberModal] = useState(false);
  const [showBackupFotosModal, setShowBackupFotosModal] = useState(false);
  const [focarAtrasadoAuto, setFocarAtrasadoAuto] = useState(false);
  const [focoLeituraTipo, setFocoLeituraTipo] = useState('atrasadas');
  const [focoEspecifico, setFocoEspecifico] = useState(null);
  const lastScheduledSignatureRef = useRef('');
  const { toast, showToast, dismissToast } = useToast();
  const {
    leituras,
    mesAnoFormatado,
    totalValor,
    totalConcluidos,
    percentualConcluido,
    leiturasHoje,
    leiturasAmanha,
    leiturasAtrasadas,
    adicionarLeitura,
    toggleCompleto,
    deletarLeitura,
    editarLeitura,
    recarregarCondominios,
  } = useLeituras(showToast);
  const { isOnline, pendentesCount, salvarLeituraOffline } = useOfflineSync();
  const totalPendentes = useMemo(
    () => leiturasHoje.length + leiturasAmanha.length + leiturasAtrasadas.length,
    [leiturasHoje, leiturasAmanha, leiturasAtrasadas]
  );
  const leiturasSignature = useMemo(() => {
    if (!Array.isArray(leituras) || leituras.length === 0) return '';
    return [...leituras]
      .sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))
      .map((l) => `${l.id}:${l.completo ? 1 : 0}:${l.diaLeitura ?? ''}`)
      .join('|');
  }, [leituras]);

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

        const { data: dbCondominios } = await supabase
          .from('condominios')
          .select('id, nome')
          .eq('user_id', user.id);

        const mapCondominios = {};
        if (dbCondominios) {
          for (const cond of dbCondominios) {
            mapCondominios[cond.nome] = cond.id;
          }
        }

        if (!errDetalhes && Array.isArray(detalhes) && detalhes.length > 0) {
          // Deduplicar: mantém apenas o registro mais recente por unidade+serviço
          const vistos = new Set();
          for (const reg of detalhes) {
            const condId = mapCondominios[reg.condominio_nome];
            if (!condId) continue; // Ignora se não achar o ID correspondente
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
          .select('condominio_nome, unidade, leitura_anterior, servico, atualizado_em')
          .eq('leiturista_id', user.id)
          .order('atualizado_em', { ascending: true });

        const gruposPlanilha = {};
        if (!errPlanilhas && Array.isArray(planilhas) && planilhas.length > 0) {
          for (const reg of planilhas) {
            const condId = reg.condominio_nome; // No legado, condominio_nome já contém o ID
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
    }).catch((error) => {
      console.warn('[App] Falha ao iniciar recebimento de planilhas:', error);
    });

    return () => {
      ShareIntentService.stop().catch((error) => {
        console.warn('[App] Falha ao remover listener de planilhas:', error);
      });
    };
  }, []);

  useEffect(() => {
    // Apenas reagenda se a lista real de leituras (IDs, dias ou status) tiver sido alterada
    if (lastScheduledSignatureRef.current !== leiturasSignature) {
      lastScheduledSignatureRef.current = leiturasSignature;
      NotificationService.scheduleReadings(leituras);
    }

    const temPendencias = totalPendentes > 0;
    atualizarBadgeIcone(temPendencias ? totalPendentes : 0);
  }, [leituras, leiturasSignature, totalPendentes]);

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

  const handleNavegarParaAtrasados = (tipo = 'atrasadas') => {
    setAbaAtiva('leituras');
    setFocoEspecifico(null);
    setFocoLeituraTipo(tipo);
    setFocarAtrasadoAuto(true);
  };

  useEffect(() => {
    if (!pendingNotificationAction || leituras.length === 0) return;
    setAbaAtiva('leituras');
    if (pendingNotificationAction.id) {
      setFocoEspecifico({
        id: pendingNotificationAction.id,
        tipo: pendingNotificationAction.focusType,
      });
    } else {
      setFocoEspecifico(null);
      setFocoLeituraTipo(pendingNotificationAction.focusType || 'atrasadas');
    }
    setFocarAtrasadoAuto(true);
    onNotificationActionHandled?.();
  }, [pendingNotificationAction, leituras.length, onNotificationActionHandled]);

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
          <div className="dashboard-shell">
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
              onOpenFaturamento={() => setShowAReceberModal(true)}
              onSync={recarregarCondominios}
              onLogout={onLogout}
              onNavigate={setAbaAtiva}
            />
            <div className="dashboard-body">
              <p className="dashboard-section-label">Ações</p>

              <div className="dashboard-acoes">
                <button
                  type="button"
                  className="dashboard-acao-btn"
                  onClick={() => setModalCondominiosAberto(true)}
                >
                  <div className="dashboard-acao-icon dashboard-acao-icon--blue">
                    <Building2 size={20} />
                  </div>
                  <span className="dashboard-acao-label">Informações do condomínio</span>
                  <span className="dashboard-acao-chevron">›</span>
                </button>

                <button
                  type="button"
                  className="dashboard-acao-btn"
                  onClick={() => setShowBackupFotosModal(true)}
                >
                  <div className="dashboard-acao-icon dashboard-acao-icon--purple">
                    <FolderSync size={20} />
                  </div>
                  <span className="dashboard-acao-label">Gerenciar fotos e backups</span>
                  <span className="dashboard-acao-chevron">›</span>
                </button>
              </div>
            </div>
          </div>
        )}


        {abaAtiva === 'leituras' && (
          <div className="app-content">
            <LeituraList
              leituras={leituras}
              leiturasHoje={leiturasHoje}
              leiturasAmanha={leiturasAmanha}
              leiturasAtrasadas={leiturasAtrasadas}
              onToggle={toggleCompleto}
              onDelete={deletarLeitura}
              onEdit={editarLeitura}
              focarAtrasadoAuto={focarAtrasadoAuto}
              focoLeituraTipo={focoLeituraTipo}
              focoEspecifico={focoEspecifico}
              onResetFocoEspecifico={() => setFocoEspecifico(null)}
              onResetFocarAtrasadoAuto={() => setFocarAtrasadoAuto(false)}
            />
          </div>
        )}

        {abaAtiva === 'cadastrar' && (
          <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#eff6ff' }}>
            <LeituraForm
              adicionarLeitura={handleAdicionarLeitura}
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
          leiturasAmanha={leiturasAmanha}
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
          mesAnoFormatado={mesAnoFormatado}
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
  const [showSplash, setShowSplash] = useState(true);
  const [retornoConfirmacao, setRetornoConfirmacao] = useState(0);
  const [legalConsentStatus, setLegalConsentStatus] = useState({
    userId: null,
    accepted: false,
    checked: false,
  });
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState({
    userId: null,
    checked: false,
    granted: false,
    canRequest: true,
    status: 'prompt',
  });
  const [pendingNotificationAction, setPendingNotificationAction] = useState(null);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleLoginSuccess = useCallback((nextSession) => {
    setSession(nextSession);
  }, []);

  const revalidarPermissaoNotificacao = useCallback(async () => {
    const res = await NotificationService.checkPermissionStatus();
    setNotificationPermissionStatus({
      userId: session?.user?.id || null,
      checked: true,
      granted: res.granted,
      canRequest: res.canRequest,
      status: res.status,
    });
    return res;
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id || null;

    if (!userId) {
      setLegalConsentStatus({
        userId: null,
        accepted: false,
        checked: false,
      });
      setNotificationPermissionStatus({
        userId: null,
        checked: false,
        granted: false,
        canRequest: true,
        status: 'prompt',
      });
      return;
    }

    setLegalConsentStatus({
      userId,
      accepted: hasLegalTermsAcceptance(session),
      checked: true,
    });
  }, [session]);

  useEffect(() => {
    if (legalConsentStatus.accepted && session?.user?.id) {
      revalidarPermissaoNotificacao();
    }
  }, [legalConsentStatus.accepted, session?.user?.id, revalidarPermissaoNotificacao]);

  useEffect(() => {
    if (!legalConsentStatus.accepted) return;

    let active = true;
    const appStatePromise = CapacitorApp.addListener('appStateChange', (state) => {
      if (active && state.isActive) {
        revalidarPermissaoNotificacao();
      }
    });

    return () => {
      active = false;
      appStatePromise.then((handle) => handle?.remove?.());
    };
  }, [legalConsentStatus.accepted, revalidarPermissaoNotificacao]);

  const handleLegalConsentAccepted = useCallback(() => {
    setLegalConsentStatus({
      userId: session?.user?.id || null,
      accepted: true,
      checked: true,
    });
  }, [session?.user?.id]);

  useEffect(() => {
    let active = true;
    let listenerHandle = null;

    NotificationService.addActionListener((extra) => {
      if (!active) return;
      if (extra?.id || extra?.focusType) {
        setPendingNotificationAction({
          id: extra.id || null,
          focusType: extra.focusType || 'atrasadas',
        });
      }
    }).then((handle) => {
      if (!active) {
        handle?.remove?.();
      } else {
        listenerHandle = handle;
      }
    }).catch((error) => {
      console.warn('Não foi possível registrar o toque das notificações:', error);
    });

    return () => {
      active = false;
      listenerHandle?.remove?.();
    };
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
    setPendingNotificationAction(null);
    setNotificationPermissionStatus({
      userId: null,
      checked: false,
      granted: false,
      canRequest: true,
      status: 'prompt',
    });
    setShowSplash(true);
    return true;
  }, []);

  useEffect(() => {
    // Detecta retorno via deep link de confirmação de e-mail
    // O shareIntentService.js já ignora URLs que não são content:// ou file://,
    // portanto este listener não gera duplicata nem conflito.
    const urlOpenListener = CapacitorApp.addListener('appUrlOpen', (data) => {
      if (data?.url?.startsWith('com.fastleituras.app://')) {
        setRetornoConfirmacao(Date.now());
      }
    });

    if (!supabase) {
      return () => { urlOpenListener.then((h) => h.remove()); };
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
      }
    });

    return () => {
      isMounted = false;
      urlOpenListener.then((h) => h.remove());
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  if (!session) {
    return <Login onLoginSuccess={handleLoginSuccess} retornoConfirmacao={retornoConfirmacao} />;
  }

  if (!legalConsentStatus.checked || legalConsentStatus.userId !== session.user.id) {
    return (
      <div className="legal-consent-loading" role="status">
        Verificando os termos de uso...
      </div>
    );
  }

  if (!legalConsentStatus.accepted) {
    return (
      <LegalConsentGate
        session={session}
        onAccepted={handleLegalConsentAccepted}
        onReject={handleLogout}
      />
    );
  }

  if (!notificationPermissionStatus.checked || notificationPermissionStatus.userId !== session.user.id) {
    return (
      <div className="legal-consent-loading" role="status">
        Verificando permissões de notificações...
      </div>
    );
  }

  if (!notificationPermissionStatus.granted) {
    return (
      <NotificationPermissionGate
        permissionStatus={notificationPermissionStatus}
        onPermissionUpdated={(res) => {
          setNotificationPermissionStatus({
            userId: session.user.id,
            checked: true,
            granted: res.granted,
            canRequest: res.canRequest,
            status: res.status,
          });
        }}
        onPermissionGranted={() => {
          setNotificationPermissionStatus({
            userId: session.user.id,
            checked: true,
            granted: true,
            canRequest: false,
            status: 'granted',
          });
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <MainApp
      onLogout={handleLogout}
      pendingNotificationAction={pendingNotificationAction}
      onNotificationActionHandled={() => setPendingNotificationAction(null)}
    />
  );
};

export default App;
