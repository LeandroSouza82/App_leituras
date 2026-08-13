import React, { useState, useRef, useEffect } from 'react';
import { X, Zap, ZapOff, Camera as CameraIcon, Check, RefreshCw } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
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
      const photo = await Camera.getPhoto({
        quality: 35, // Compressão extrema para salvar no Supabase (meta 25-40KB)
        width: 800,  // Redimensionamento nativo para 800px de largura
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        correctOrientation: true, // Garante que a foto não fique virada
        promptLabelHeader: unitInfo,
        promptLabelPhoto: 'Selecionar da Galeria',
        promptLabelDevice: 'Tirar Foto',
      });

      if (photo.base64String) {
        const rawBase64Image = `data:image/jpeg;base64,${photo.base64String}`;
        setCapturedImage(rawBase64Image);
        // Limpeza imediata da referência do objeto photo para liberar memória
        photo.base64String = null;
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

    if (capturedImage) {
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
      {capturedImage ? (
        <div className="camera-confirm-container">
          <img src={capturedImage} alt="Captura" className="preview-img" />
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
