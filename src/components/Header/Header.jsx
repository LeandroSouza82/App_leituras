import { CalendarDays, Share2 } from 'lucide-react';
import './Header.css';
import { gerarRelatorioExcel } from '../../utils/exportExcel';

const formatCurrency = (value) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const getCurrentMonthYear = () => {
  const now = new Date();
  const formatted = now.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const isValidMonthYear = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'invalid date') {
    return false;
  }

  return true;
};

const Header = ({ mesAnoFormatado, totalCondominios, totalConcluidos, percentualConcluido, totalValor, leituras }) => {
  const title = isValidMonthYear(mesAnoFormatado) ? mesAnoFormatado : getCurrentMonthYear();

  const handleExportClick = async () => {
    const arquivo = gerarRelatorioExcel(leituras, title);

    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({
          files: [arquivo],
          title: 'Relatório de Leituras',
        });
        return;
      } catch {
        // fallback para download
      }
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(arquivo);
    link.download = arquivo.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };

  return (
    <header className="header-card">
      <div className="header-title">
        <div className="header-icon">
          <CalendarDays size={20} />
        </div>
        <div>
          <p className="eyebrow">LeiturasApp</p>
          <h1>{title}</h1>
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
        <button type="button" className="stat-card stat-card-action" onClick={handleExportClick}>
          <div className="stat-card-label">
            <span>A receber</span>
            <Share2 size={16} />
          </div>
          <strong>{formatCurrency(totalValor)}</strong>
        </button>
      </div>
    </header>
  );
};

export default Header;
