import { Bell, CalendarDays, Share2 } from 'lucide-react';
import './Header.css';
import { gerarRelatorioExcel } from '../../utils/exportExcel';

const formatCurrency = (value) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const getCurrentMonthYear = () => {
  const dataAtual = new Date();
  const mesAnoFormatado = dataAtual.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return mesAnoFormatado.charAt(0).toUpperCase() + mesAnoFormatado.slice(1);
};

const Header = ({
  mesAnoFormatado,
  totalCondominios,
  totalConcluidos,
  percentualConcluido,
  totalValor,
  leituras,
  totalPendentes,
  onOpenAlerts,
}) => {
  const title = getCurrentMonthYear();

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

      <div className="header-actions">
        <button type="button" className="alert-button" onClick={onOpenAlerts} aria-label="Abrir alertas">
          <Bell size={18} />
          {totalPendentes > 0 && <span className="alert-badge">{totalPendentes}</span>}
        </button>
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
