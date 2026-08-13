import React, { useState, useEffect } from 'react';
import { Camera as CameraIcon, X, CheckCircle, Share2 } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LeituraService } from '../../services/leituraService';
import './LeituraFotoModal.css';

const LeituraFotoModal = ({ isOpen, onClose, leitura }) => {
  const [fotosCapturadas, setFotosCapturadas] = useState({});
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (isOpen && leitura) {
      verificarFotosSalvas();
    }
  }, [isOpen, leitura]);

  const verificarFotosSalvas = async () => {
    try {
      const { files } = await Filesystem.readdir({
        path: 'leituras',
        directory: Directory.Data,
      });

      const prefixo = leitura.nome.replace(/\s+/g, '_');
      const capturadas = {};

      files.forEach((file) => {
        const fileName = typeof file === 'string' ? file : file.name;
        if (fileName.startsWith(prefixo)) {
          // Extrai o AP da string Condominio_AP-01_Timestamp
          const partes = fileName.split('_');
          if (partes.length >= 2) {
            capturadas[partes[1]] = true;
          }
        }
      });
      setFotosCapturadas(capturadas);
    } catch (e) {
      console.warn('Pasta de leituras vazia ou inacessível.');
    }
  };

  const processarImagem = (uri, apto) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = uri;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const maxWidth = 800;
        const scale = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const now = new Date();
        const timestamp = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const texto = `${apto} - ${timestamp}`;

        ctx.font = 'bold 22px Arial';
        const textMetrics = ctx.measureText(texto);
        const textWidth = textMetrics.width;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(10, canvas.height - 45, textWidth + 20, 35);

        ctx.fillStyle = 'white';
        ctx.fillText(texto, 20, canvas.height - 20);

        const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        resolve(base64);
      };
      img.onerror = (e) => reject(e);
    });
  };

  const handleTirarFoto = async (apto) => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      const base64Data = await processarImagem(image.webPath, apto);
      const timestamp = new Date().getTime();
      const nomeCondominioLimpo = leitura.nome.replace(/\s+/g, '_');
      const fileName = `${nomeCondominioLimpo}_${apto}_${timestamp}.jpg`;

      await Filesystem.writeFile({
        path: `leituras/${fileName}`,
        data: base64Data,
        directory: Directory.Data,
      });

      setFotosCapturadas((prev) => ({ ...prev, [apto]: true }));
      alert(`Foto do ${apto} salva com sucesso!`);
    } catch (error) {
      if (error.message !== 'User cancelled photos app') {
        console.error('Erro no fluxo de foto:', error);
        alert('Falha ao processar/salvar foto: ' + error.message);
      }
    }
  };

  const handleExportar = async () => {
    setExportando(true);
    const sucesso = await LeituraService.exportarParaWhatsApp(leitura);
    if (sucesso) {
      alert('CSV de leitura exportado com sucesso!');
    }
    setExportando(false);
  };

  if (!isOpen || !leitura) return null;

  const qtdAptos = Number(leitura.apartamentos) || 0;
  const aptos = Array.from({ length: qtdAptos }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return `AP-${num}`;
  });

  return (
    <div className="foto-modal-overlay" onClick={onClose}>
      <div className="foto-modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="foto-modal-header">
          <div className="foto-modal-title">
            <h3>{leitura.nome}</h3>
            <p>Registre as fotos das unidades</p>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="foto-modal-body">
          <div className="apartamentos-grid">
            {aptos.map((apto) => {
              const jaCapturada = fotosCapturadas[apto];
              return (
                <button
                  key={apto}
                  type="button"
                  className={`btn-apto ${jaCapturada ? 'foto-concluida' : ''}`}
                  onClick={() => handleTirarFoto(apto)}
                >
                  {jaCapturada ? (
                    <CheckCircle className="btn-apto-icon-success" size={18} />
                  ) : (
                    <CameraIcon size={18} />
                  )}
                  {apto}
                </button>
              );
            })}
          </div>
        </div>

        <footer className="foto-modal-footer">
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-exportar-csv"
              onClick={handleExportar}
              disabled={exportando || Object.keys(fotosCapturadas).length === 0}
            >
              <Share2 size={18} />
              {exportando ? 'Exportando...' : 'Exportar CSV (uCondo)'}
            </button>
            <button type="button" className="btn-cancelar-foto" onClick={onClose}>
              Fechar
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LeituraFotoModal;
