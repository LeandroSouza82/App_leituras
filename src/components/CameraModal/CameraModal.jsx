import React, { useState, useRef, useEffect } from 'react';
import { X, Zap, ZapOff, Camera, Check, RefreshCw } from 'lucide-react';
import './CameraModal.css';

const CameraModal = ({ isOpen, onClose, onCapture, unitInfo }) => {
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [flashOn, setFlashOn] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Erro ao acessar a câmera traseira:', err);
      // Fallback para qualquer câmera se a traseira falhar (ex: simulador)
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(mediaStream);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch (e) {
        alert('Não foi possível acessar a câmera.');
        onClose();
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      setStream(null);
    }
    setFlashOn(false);
    setCapturedImage(null);
  };

  const toggleFlash = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();

    if (capabilities.torch) {
      try {
        const newState = !flashOn;
        await track.applyConstraints({
          advanced: [{ torch: newState }]
        });
        setFlashOn(newState);
      } catch (e) {
        console.warn('Lanterna não suportada neste dispositivo/navegador.');
      }
    } else {
      alert('A lanterna não é suportada por este navegador/aparelho.');
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setCapturedImage(canvas.toDataURL('image/jpeg', 0.8));
  };

  const handleConfirm = () => {
    onCapture(capturedImage);
    stopCamera();
    onClose();
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  if (!isOpen) return null;

  return (
    <div className="camera-modal-root">
      {!capturedImage ? (
        <div className="camera-view-container">
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />

          <div className="camera-overlay">
            <header className="camera-header">
              <span className="camera-unit-label">{unitInfo}</span>
              <div className="camera-top-actions">
                <button type="button" className={`btn-flash ${flashOn ? 'on' : ''}`} onClick={toggleFlash}>
                  {flashOn ? <Zap size={24} /> : <ZapOff size={24} />}
                </button>
                <button type="button" className="btn-close-camera" onClick={onClose}>
                  <X size={24} />
                </button>
              </div>
            </header>

            <div className="camera-footer">
              <button type="button" className="btn-shutter" onClick={takePhoto}>
                <div className="shutter-inner" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="camera-confirm-container">
          <img src={capturedImage} alt="Captura" className="preview-img" />
          <div className="confirm-overlay">
            <h3>Confirmar Foto?</h3>
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
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default CameraModal;
