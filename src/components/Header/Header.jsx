import { customAlert } from '../../components/CustomPrompt/CustomPrompt';
import { useState } from 'react';
import { Bell, Menu, Share2, Eye, EyeOff } from 'lucide-react';
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
  const [valoresOcultos, setValoresOcultos] = useState(() => {
    return localStorage.getItem('dashboard_valores_ocultos') === 'true';
  });
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
      <div className="header-valor-destaque">
        <div
          className="flex justify-between items-center w-full mb-2"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}
        >
          <div
            className="flex items-center gap-1.5"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span className="header-valor-label" style={{ margin: 0 }}>
              A receber
            </span>
            <button
              type="button"
              onClick={handleExportClick}
              title="Exportar relatório"
              className="bg-transparent border-none outline-none shadow-none text-white p-1 hover:opacity-80 flex items-center justify-center cursor-pointer"
              style={{ background: 'transparent', border: 'none', outline: 'none', boxShadow: 'none', padding: '2px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Share2 size={15} className="text-white" style={{ opacity: 0.9, color: '#ffffff' }} />
            </button>
          </div>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const novoEstado = !valoresOcultos;
              setValoresOcultos(novoEstado);
              localStorage.setItem('dashboard_valores_ocultos', String(novoEstado));
            }}
            aria-label={valoresOcultos ? 'Mostrar valor' : 'Ocultar valor'}
            className="bg-transparent border-none outline-none shadow-none text-white p-1 hover:opacity-80 flex items-center justify-center cursor-pointer ml-auto"
            style={{ background: 'transparent', border: 'none', outline: 'none', boxShadow: 'none', padding: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }}
          >
            {!valoresOcultos ? <Eye size={18} className="text-white" style={{ color: '#ffffff' }} /> : <EyeOff size={18} className="text-white" style={{ color: '#ffffff' }} />}
          </button>
        </div>
        <strong className="header-valor-numero">
          {!valoresOcultos ? formatCurrency(totalValor) : '••••••'}
        </strong>
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
          <strong className="header-metrica-valor">{!valoresOcultos ? formatCurrency(totalValor) : '••••••'}</strong>
        </div>
      </div>

      <ListaCondominiosModal
        isOpen={modalCondominiosAberto}
        onClose={() => setModalCondominiosAberto(false)}
        leituras={leituras || []}
        isFromDashboard={true}
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
