import { customAlert } from '../../components/CustomPrompt/CustomPrompt';
import { useState } from 'react';
import { Bell, Menu, Share2, Eye, EyeOff } from 'lucide-react';
import './Header.css';
import { gerarRelatorioLeiturasExcel } from '../../services/relatorioExcelService';
import ProgressoLeituras from '../ProgressoLeituras/ProgressoLeituras';
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

const VISIBILIDADE_VALORES_KEY = 'fast_leituras_mostrar_valores';

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
  onLogout,
  onNavigate,
}) => {
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [mostrarValor, setMostrarValor] = useState(() => {
    const salvo = localStorage.getItem(VISIBILIDADE_VALORES_KEY);
    if (salvo === null) {
      return true;
    }
    return salvo === 'true';
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
              setMostrarValor((valorAtual) => {
                const novoValor = !valorAtual;
                localStorage.setItem(VISIBILIDADE_VALORES_KEY, String(novoValor));
                return novoValor;
              });
            }}
            aria-label={mostrarValor ? 'Ocultar valor' : 'Mostrar valor'}
            className="bg-transparent border-none outline-none shadow-none text-white p-1 hover:opacity-80 flex items-center justify-center cursor-pointer ml-auto"
            style={{ background: 'transparent', border: 'none', outline: 'none', boxShadow: 'none', padding: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }}
          >
            {mostrarValor ? <Eye size={18} className="text-white" style={{ color: '#ffffff' }} /> : <EyeOff size={18} className="text-white" style={{ color: '#ffffff' }} />}
          </button>
        </div>
        <strong className="header-valor-numero">
          {mostrarValor ? formatCurrency(totalValor) : 'R$ ••••'}
        </strong>
      </div>

      {/* Linha 3: Progresso mensal */}
      <ProgressoLeituras
        percentual={percentualConcluido}
        concluidos={totalConcluidos}
        total={totalCondominios}
        onClick={onOpenProgressoModal}
      />

      {/* Linha 4: Métricas secundárias lado a lado */}
      <div className="header-metricas">
        <div
          className="header-metrica-bloco header-metrica-bloco--condominios"
          aria-label={`${totalCondominios} condomínios cadastrados`}
        >
          <span className="header-metrica-label header-metrica-label--condominios">Condomínios</span>
          <strong className="header-metrica-valor header-metrica-valor--condominios">
            {totalCondominios}
          </strong>
          <svg
            className="header-condominio-ilustracao"
            viewBox="0 0 72 72"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="condominio-fachada" x1="15" y1="10" x2="58" y2="62" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ffffff" stopOpacity="0.96" />
                <stop offset="1" stopColor="#d9f1ff" stopOpacity="0.68" />
              </linearGradient>
              <linearGradient id="condominio-lateral" x1="44" y1="27" x2="60" y2="59" gradientUnits="userSpaceOnUse">
                <stop stopColor="#d7efff" stopOpacity="0.82" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0.48" />
              </linearGradient>
            </defs>
            <path
              d="M16 59V23.5c0-1.8 1.1-3.5 2.8-4.2L43 9.2c1.3-.5 2.7.4 2.7 1.8v48"
              fill="url(#condominio-fachada)"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M45.7 27.2 57 32.1c1.2.5 2 1.7 2 3V59H45.7"
              fill="url(#condominio-lateral)"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <g fill="#268ed5" fillOpacity="0.74">
              <rect x="22" y="23" width="6" height="6" rx="1.4" />
              <rect x="33" y="20" width="6" height="6" rx="1.4" />
              <rect x="22" y="34" width="6" height="6" rx="1.4" />
              <rect x="33" y="31" width="6" height="6" rx="1.4" />
              <rect x="22" y="45" width="6" height="6" rx="1.4" />
              <rect x="33" y="42" width="6" height="6" rx="1.4" />
              <rect x="49" y="37" width="5.5" height="5.5" rx="1.3" />
              <rect x="49" y="47" width="5.5" height="5.5" rx="1.3" />
            </g>
            <path d="M33 59v-9h7v9M10 59h53" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div
          className="header-metrica-bloco header-metrica-bloco--faturamento header-metrica-bloco--clickable"
          onClick={onOpenFaturamento}
          aria-label="Ver faturamento detalhado"
        >
          <span className="header-metrica-label header-metrica-label--faturamento">Faturado</span>
          <strong className="header-metrica-valor header-metrica-valor--faturamento">
            {mostrarValor ? formatCurrency(totalValor) : 'R$ ••••'}
          </strong>
          <svg
            className="header-faturamento-ilustracao"
            viewBox="0 0 72 72"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="faturamento-moeda" x1="23" y1="14" x2="56" y2="57" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ffffff" stopOpacity="0.96" />
                <stop offset="1" stopColor="#d9f1ff" stopOpacity="0.68" />
              </linearGradient>
              <linearGradient id="faturamento-moeda-fundo" x1="10" y1="28" x2="42" y2="60" gradientUnits="userSpaceOnUse">
                <stop stopColor="#d7efff" stopOpacity="0.72" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0.38" />
              </linearGradient>
            </defs>
            <circle
              cx="27"
              cy="42"
              r="17"
              fill="url(#faturamento-moeda-fundo)"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
            <circle
              cx="43"
              cy="33"
              r="21"
              fill="url(#faturamento-moeda)"
              stroke="#ffffff"
              strokeWidth="1.8"
            />
            <path
              d="M47.5 22.5h-8.3c-3.7 0-6 2.1-6 5.1 0 3.2 2.4 4.6 6 5.4l6.2 1.3c3.8.8 6 2.4 6 5.6 0 3.1-2.5 5.4-6.5 5.4h-9.2M42.3 18.4v31"
              fill="none"
              stroke="#268ed5"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M13 61h48" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

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
