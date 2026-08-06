import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, DollarSign } from 'lucide-react';
import './index.css';
import Header from './components/Header/Header';
import LeituraForm from './components/LeituraForm/LeituraForm';
import LeituraList from './components/LeituraList/LeituraList';
import Navigation from './components/Navigation/Navigation';
import { useLeituras } from './hooks/useLeituras';
import { showLeituraNotifications } from './utils/notifications';
import ModalAviso from './components/ModalAviso/ModalAviso';
import ListaCondominiosModal from './components/ListaCondominiosModal/ListaCondominiosModal';
import ProgressoModal from './components/ProgressoModal/ProgressoModal';
import { atualizarBadgeIcone } from './utils/appBadge';

const App = () => {
  const [abaAtiva, setAbaAtiva] = useState('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCondominiosAberto, setModalCondominiosAberto] = useState(false);
  const [showProgressoModal, setShowProgressoModal] = useState(false);
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
  } = useLeituras();
  const notificacaoEnviadaRef = useRef(false);
  const totalPendentes = useMemo(() => leiturasHoje.length + leiturasAtrasadas.length, [leiturasHoje, leiturasAtrasadas]);

  const handleAdicionarLeitura = (dados) => {
    adicionarLeitura(dados);
    setAbaAtiva('leituras');
  };

  const handleImportSuccess = (quantidade) => {
    alert(`${quantidade} condomínios importados com sucesso!`);
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

  return (
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

              <article className="metric-card metric-gold">
                <div className="metric-icon">
                  <DollarSign size={20} />
                </div>
                <div>
                  <p>Total faturado</p>
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

      <ModalAviso
        isOpen={isModalOpen}
        onClose={handleCloseAlerts}
        leiturasHoje={leiturasHoje}
        leiturasAtrasadas={leiturasAtrasadas}
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

      <Navigation activeTab={abaAtiva} onChange={setAbaAtiva} />
    </div>
  );
};

export default App;
