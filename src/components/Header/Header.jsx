import { useState } from 'react';
import { Bell, Menu, Share2 } from 'lucide-react';
import './Header.css';
import { gerarRelatorioExcel } from '../../utils/exportExcel';
import ListaCondominiosModal from '../ListaCondominiosModal/ListaCondominiosModal';
import SideMenu from '../SideMenu/SideMenu';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

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
}) => {
  const [modalCondominiosAberto, setModalCondominiosAberto] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const title = getCurrentMonthYear();

  const handleExportClick = async () => {
    try {
      const arquivo = gerarRelatorioExcel(leituras, title);
      const fileName = arquivo.name;

      if (Capacitor.isNativePlatform()) {
        try {
          const buffer = await arquivo.arrayBuffer();
          const base64Data = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          const result = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
          });

          await Share.share({
            title: 'Relatório de Leituras',
            text: `Segue o relatório de faturamento - ${title}`,
            url: result.uri,
            dialogTitle: 'Exportar Planilha Excel',
          });
        } catch (nativeError) {
          console.error('Erro no ambiente nativo:', nativeError);
          alert(`Erro Mobile: ${nativeError.message}`);
        }
      } else {
        if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
          try {
            await navigator.share({
              files: [arquivo],
              title: 'Relatório de Leituras',
            });
            return;
          } catch (err) {
            console.warn('Share API failed, falling back to download');
          }
        }

        const link = document.createElement('a');
        link.href = URL.createObjectURL(arquivo);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          link.remove();
          URL.revokeObjectURL(link.href);
        }, 100);
      }
    } catch (error) {
      console.error('Erro na exportação:', error);
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
      />
    </header>
  );
};

export default Header;

