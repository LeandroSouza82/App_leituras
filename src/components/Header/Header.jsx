import { customAlert } from '../../components/CustomPrompt/CustomPrompt';
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
  onOpenFaturamento,
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
      await customAlert('Erro ao exportar Excel: ' + error.message);
    }
  };

  return (
    <header className="header-card">
      {/* Linha 1: Menu + Título + Sino */}
      <div className="header-topbar">
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => setIsSideMenuOpen(true)}
          aria-label="Abrir Menu Principal"
        >
          <Menu size={22} />
        </button>

        <div className="header-title-block">
          <p className="eyebrow">Fast Leituras</p>
          <h1>{title}</h1>
        </div>

        <button
          type="button"
          className="header-icon-btn"
          onClick={onOpenAlerts}
          aria-label="Abrir alertas"
        >
          <Bell size={20} />
          {totalPendentes > 0 && (
            <span className="alert-badge">{totalPendentes}</span>
          )}
        </button>
      </div>

      {/* Linha 2: Valor a receber em destaque */}
      <div className="header-valor-destaque" onClick={handleExportClick} title="Exportar relatório">
        <span className="header-valor-label">
          A receber
          <Share2 size={14} style={{ marginLeft: 6, opacity: 0.8 }} />
        </span>
        <strong className="header-valor-numero">{formatCurrency(totalValor)}</strong>
      </div>

      {/* Linha 3: Barra de progresso */}
      <div
        className="header-progresso"
        onClick={onOpenProgressoModal}
        style={{ cursor: 'pointer' }}
        aria-label="Ver progresso"
      >
        <div className="header-progresso-track">
          <div className="header-progresso-fill" style={{ width: `${percentualConcluido}%` }} />
        </div>
        <span className="header-progresso-texto">
          {totalConcluidos}/{totalCondominios} concluídos
        </span>
      </div>

      {/* Linha 4: Métricas secundárias lado a lado */}
      <div className="header-metricas">
        <div
          className="header-metrica-bloco"
          onClick={() => setModalCondominiosAberto(true)}
          style={{ cursor: 'pointer' }}
          aria-label="Ver condomínios"
        >
          <span className="header-metrica-label">Condomínios</span>
          <strong className="header-metrica-valor">{totalCondominios}</strong>
        </div>
        <div
          className="header-metrica-bloco header-metrica-bloco--clickable"
          onClick={onOpenFaturamento}
          aria-label="Ver faturamento detalhado"
        >
          <span className="header-metrica-label">Faturado</span>
          <strong className="header-metrica-valor">{formatCurrency(totalValor)}</strong>
        </div>
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
