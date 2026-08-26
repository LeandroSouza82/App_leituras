import { useState } from 'react';
import { Bell, Menu, Share2 } from 'lucide-react';
import './Header.css';
import { gerarRelatorioLeiturasExcel } from '../../services/relatorioExcelService';
import ListaCondominiosModal from '../ListaCondominiosModal/ListaCondominiosModal';
import SideMenu from '../SideMenu/SideMenu';

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
  onOpenProgressoModal,
  onSync,
  onLogout,
  onNavigate,
}) => {
  const [modalCondominiosAberto, setModalCondominiosAberto] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const title = getCurrentMonthYear();

  const handleExportClick = async () => {
    try {
      await gerarRelatorioLeiturasExcel(leituras || [], mesAnoFormatado || title, 1650);
    } catch (error) {
      alert('Erro ao exportar Excel: ' + error.message);
    }
  };

  return (
    <header className="header-card">
      <div className="header-title">
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => setIsSideMenuOpen(true)}
          aria-label="Abrir Menu Principal"
        >
          <Menu size={22} />
        </button>
        <div>
          <p className="eyebrow">Fast Leituras</p>
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
        <div
          className="stat-card"
          onClick={() => setModalCondominiosAberto(true)}
          style={{ cursor: 'pointer' }}
        >
          <span>Condomínios</span>
          <strong>{totalCondominios}</strong>
        </div>
        <div
          className="stat-card stat-card-action"
          onClick={onOpenProgressoModal || (() => setModalCondominiosAberto(true))}
          style={{ cursor: 'pointer' }}
        >
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

      <ListaCondominiosModal
        isOpen={modalCondominiosAberto}
        onClose={() => setModalCondominiosAberto(false)}
        leituras={leituras || []}
      />

      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        onLogout={onLogout}
        onNavigate={onNavigate}
      />
    </header>
  );
};

export default Header;

