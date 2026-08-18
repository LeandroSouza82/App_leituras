import React, { useEffect, useRef, useState } from "react";
import { CameraPreview } from "@capacitor-community/camera-preview";
import { X, Camera, RefreshCw } from "lucide-react";
import "./CustomCamera.css";

/**
 * CustomCamera — câmera in-app estilo uCondo.
 *
 * Props:
 *   onCapture(base64: string) — chamado após captura bem-sucedida
 *   onClose()                 — chamado ao fechar sem capturar
 */
const CustomCamera = ({ onCapture, onClose }) => {
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const stoppedRef = useRef(false);

  // ─── Inicializa a câmera ao montar ───────────────────────────────────────
  useEffect(() => {
    stoppedRef.current = false;
    // Deixa body transparente para o preview nativo aparecer atrás da WebView
    document.body.classList.add("camera-preview-active");

    const startCamera = async () => {
      try {
        await CameraPreview.start({
          position: "rear",
          parent: "custom-camera-preview",
          className: "camera-preview-slot",
          toBack: true,
          disableAudio: true,
        });
        setIsReady(true);
      } catch (err) {
        console.error("[CustomCamera] Erro ao iniciar câmera:", err);
        stopCamera();
        onClose();
      }
    };

    startCamera();

    return () => {
      stopCamera();
      document.body.classList.remove("camera-preview-active");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const stopCamera = async () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    try {
      await CameraPreview.stop();
    } catch (_) { /* já parada */ }
    document.body.classList.remove("camera-preview-active");
  };

  const stopAndClose = async () => {
    await stopCamera();
    onClose();
  };

  // ─── Captura ─────────────────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!isReady || isCapturing) return;
    setIsCapturing(true);
    try {
      // quality: 60, width: 800 — regra estrita de compressão do projeto
      const result = await CameraPreview.capture({ quality: 60, width: 800 });
      const base64 = result?.value;
      if (!base64) throw new Error("Captura retornou vazia.");

      await stopCamera();
      onCapture(base64); // entrega ao pai; stamp + salvar ocorrem lá
    } catch (err) {
      console.error("[CustomCamera] Erro ao capturar:", err);
      setIsCapturing(false);
      alert("❌ Erro ao capturar foto: " + (err?.message || err));
    }
  };

  // ─── Virar câmera ────────────────────────────────────────────────────────
  const handleFlip = async () => {
    if (!isReady || isCapturing) return;
    try {
      await CameraPreview.flip();
    } catch (err) {
      console.error("[CustomCamera] Erro ao virar câmera:", err);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="custom-camera-root" id="custom-camera-preview">
      {/* Botão virar câmera — canto superior direito */}
      <button
        type="button"
        className="cam-btn cam-btn-flip"
        onClick={handleFlip}
        disabled={!isReady || isCapturing}
        title="Virar câmera"
      >
        <RefreshCw size={22} />
      </button>

      {/* Indicador de carregamento */}
      {!isReady && (
        <div className="cam-loading">
          <span>Iniciando câmera…</span>
        </div>
      )}

      {/* Rodapé: X | Capturar | espaço simétrico */}
      <footer className="cam-footer">
        <button
          type="button"
          className="cam-btn cam-btn-close"
          onClick={stopAndClose}
          disabled={isCapturing}
          title="Fechar"
        >
          <X size={24} />
        </button>

        <button
          type="button"
          className={`cam-btn cam-btn-capture${isCapturing ? " capturing" : ""}`}
          onClick={handleCapture}
          disabled={!isReady || isCapturing}
          title="Capturar foto"
        >
          <Camera size={36} />
        </button>

        {/* Placeholder para simetria visual */}
        <div className="cam-btn cam-btn-placeholder" aria-hidden="true" />
      </footer>
    </div>
  );
};

export default CustomCamera;
