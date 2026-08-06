import { useState } from 'react';
import { Building2, CheckCircle2, DollarSign } from 'lucide-react';
import './index.css';
import Header from './components/Header/Header';
import LeituraForm from './components/LeituraForm/LeituraForm';
import LeituraList from './components/LeituraList/LeituraList';
import Navigation from './components/Navigation/Navigation';
import { useLeituras } from './hooks/useLeituras';

const App = () => {
  const [abaAtiva, setAbaAtiva] = useState('dashboard');
  const {
    leituras,
    mesAnoFormatado,
    totalValor,
    totalConcluidos,
    percentualConcluido,
    adicionarLeitura,
    adicionarEmLote,
    toggleCompleto,
    deletarLeitura,
  } = useLeituras();

  const handleAdicionarLeitura = (dados) => {
    adicionarLeitura(dados);
    setAbaAtiva('leituras');
  };

  const handleImportSuccess = (quantidade) => {
    alert(`${quantidade} condomínios importados com sucesso!`);
    setAbaAtiva('leituras');
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
          />
          <section className="dashboard-summary">
            <div className="dashboard-grid">
              <article className="metric-card metric-blue">
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

            <div className="completion-card">
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
          <LeituraList leituras={leituras} onToggle={toggleCompleto} onDelete={deletarLeitura} />
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

      <Navigation activeTab={abaAtiva} onChange={setAbaAtiva} />
    </div>
  );
};

export default App;
