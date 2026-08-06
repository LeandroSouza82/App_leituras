import { CalendarDays } from 'lucide-react';
import './Header.css';

const formatCurrency = (value) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const Header = ({ mesAnoFormatado, totalCondominios, totalConcluidos, percentualConcluido, totalValor }) => {
  return (
    <header className="header-card">
      <div className="header-title">
        <div className="header-icon">
          <CalendarDays size={20} />
        </div>
        <div>
          <p className="eyebrow">LeiturasApp</p>
          <h1>{mesAnoFormatado}</h1>
        </div>
      </div>

      <div className="header-stats">
        <div className="stat-card">
          <span>Condomínios</span>
          <strong>{totalCondominios}</strong>
        </div>
        <div className="stat-card">
          <span>Progresso</span>
          <strong>{totalConcluidos}/{totalCondominios}</strong>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${percentualConcluido}%` }} />
          </div>
        </div>
        <div className="stat-card">
          <span>A receber</span>
          <strong>{formatCurrency(totalValor)}</strong>
        </div>
      </div>
    </header>
  );
};

export default Header;
