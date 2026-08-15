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
      // Captura via Base64 para evitar erros de "Invalid Path" da WebView
      const photo = await CameraService.capturarFotoBase64(unitInfo);

      if (photo.base64) {
        // Armazenamos um objeto com o base64 para o salvamento e o webPath para o preview
        setCapturedImage(photo);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Erro ao abrir câmera Capacitor:', err);
      if (err.message !== 'User cancelled photos app') {
        alert('Erro ao acessar a câmera: ' + err.message);
      }
      onClose();
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const handleConfirm = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (capturedImage?.base64) {
      // Repassamos os dados brutos para o salvamento seguro
      onCapture(capturedImage);
    }
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
