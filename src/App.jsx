import './index.css';
import Header from './components/Header/Header';
import LeituraForm from './components/LeituraForm/LeituraForm';
import LeituraList from './components/LeituraList/LeituraList';
import { useLeituras } from './hooks/useLeituras';

const App = () => {
  const {
    leituras,
    mesAnoFormatado,
    totalValor,
    totalConcluidos,
    percentualConcluido,
    adicionarLeitura,
    toggleCompleto,
    deletarLeitura,
  } = useLeituras();

  return (
    <div className="app-shell">
      <Header
        mesAnoFormatado={mesAnoFormatado}
        totalCondominios={leituras.length}
        totalConcluidos={totalConcluidos}
        percentualConcluido={percentualConcluido}
        totalValor={totalValor}
      />

      <div className="app-content">
        <LeituraForm adicionarLeitura={adicionarLeitura} />
        <LeituraList leituras={leituras} onToggle={toggleCompleto} onDelete={deletarLeitura} />
      </div>
    </div>
  );
};

export default App;
