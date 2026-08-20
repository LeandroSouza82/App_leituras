import React, { useState, useEffect } from 'react';
import { X, Camera as CameraIcon, Check, RefreshCw } from 'lucide-react';
import { CameraService } from '../../services/cameraService';
import './CameraModal.css';

const CameraModal = ({ isOpen, onClose, onCapture, unitInfo }) => {
  const [capturedImage, setCapturedImage] = useState(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);

  useEffect(() => {
    if (isOpen && !capturedImage && !isTakingPhoto) {
      openCapacitorCamera();
    }
  }, [isOpen, capturedImage]);

  const openCapacitorCamera = async () => {
    try {
      setIsTakingPhoto(true);
      // Captura via CameraResultType.Uri para evitar carregar Base64 gigante na RAM
      const photo = await CameraService.capturarFoto(unitInfo);

      if (photo?.webPath) {
        setCapturedImage(photo);
      } else {
        onClose();
      }
    } catch (err) {
      const msg = String(err?.message || '');
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('cancelled')) {
        alert('Erro ao acessar a câmera: ' + msg);
      }
      onClose();
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const handleConfirm = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (capturedImage?.webPath) {
      // Repassa os dados da captura baseados em URI para o salvamento
      onCapture(capturedImage);
    }
    // Desaloca imediatamente a imagem da memória local do modal
    setCapturedImage(null);
    onClose();
  };

  const handleRetake = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCapturedImage(null);
    openCapacitorCamera();
  };

  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCapturedImage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="camera-modal-root" onClick={(e) => e.stopPropagation()}>
      {capturedImage?.webPath ? (
        <div className="camera-confirm-container">
          <img src={capturedImage.webPath} alt="Captura" className="preview-img" />
          <div className="confirm-overlay">
            <h3>{unitInfo}</h3>
            <p>Conferir nitidez da leitura</p>
            <div className="confirm-actions">
              <button type="button" className="btn-confirm-no" onClick={handleRetake}>
                <RefreshCw size={20} /> Refazer
              </button>
              <button type="button" className="btn-confirm-yes" onClick={handleConfirm}>
                <Check size={20} /> Aprovar Foto
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="camera-loading-view">
          <div className="loading-spinner">
            <CameraIcon size={40} className="spin-animation" />
            <p>Abrindo Câmera...</p>
          </div>
          <button type="button" className="btn-close-loading" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  );
};

export default CameraModal;
