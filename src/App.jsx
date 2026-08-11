import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, DollarSign } from 'lucide-react';
import './index.css';
import Header from './components/Header/Header';
import LeituraForm from './components/LeituraForm/LeituraForm';
import LeituraList from './components/LeituraList/LeituraList';
import BottomNavbar from './components/BottomNavbar/BottomNavbar';
import SplashScreen from './components/SplashScreen/SplashScreen';
import AReceberModal from './components/AReceberModal/AReceberModal';
import { useLeituras } from './hooks/useLeituras';
import { showLeituraNotifications } from './utils/notifications';
import ModalAviso from './components/ModalAviso/ModalAviso';
import ListaCondominiosModal from './components/ListaCondominiosModal/ListaCondominiosModal';
import ProgressoModal from './components/ProgressoModal/ProgressoModal';
import { atualizarBadgeIcone } from './utils/appBadge';
import Toast, { useToast } from './components/Toast/Toast';
import Perfil from './pages/Perfil/Perfil';

const SPLASH_SESSION_KEY = 'fast-leitura-splash-concluida';

const App = () => {
  const [showSplash, setShowSplash] = useState(() => sessionStorage.getItem(SPLASH_SESSION_KEY) !== 'true');
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
  } = useLeituras(showToast);
  const notificacaoEnviadaRef = useRef(false);
  const totalPendentes = useMemo(() => leiturasHoje.length + leiturasAtrasadas.length, [leiturasHoje, leiturasAtrasadas]);

  const handleAdicionarLeitura = (dados) => {
    adicionarLeitura(dados);
    setAbaAtiva('leituras');
  };

  const handleImportSuccess = (quantidade) => {
    showToast(`${quantidade} condomínios importados com sucesso!`);
    setAbaAtiva('leituras');
  };

  useEffect(() => {
    const temPendencias = leiturasHoje.length > 0 || leiturasAtrasadas.length > 0;

    if (!temPendencias) {
      notificacaoEnviadaRef.current = false;
      atualizarBadgeIcone(0);
      return;
    }

    if (!notificacaoEnviadaRef.current) {
      notificacaoEnviadaRef.current = true;
      showLeituraNotifications({ leiturasHoje, leiturasAtrasadas });
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

  const handleSplashFinish = useCallback(() => {
    sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
    setShowSplash(false);
  }, []);

  return (
    <>
      {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
      <div className="app-shell app-has-navigation">
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
            />
            <section className="dashboard-summary">
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
            />
          </div>
        )}

        {abaAtiva === 'perfil' && (
          <Perfil
            onShowToast={showToast}
            onNavigate={setAbaAtiva}
            onRefresh={() => window.location.reload()}
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
      <Toast {...toast} onClose={dismissToast} />
    </>
  );
};

export default App;
