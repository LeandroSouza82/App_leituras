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
    document.body.classList.add("camera-active");

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
        if (err?.message === 'camera already started' || err?.message?.includes('already started')) {
          console.log('[CustomCamera] Câmera já estava rodando em background. Ignorando erro e prosseguindo.');
          setIsReady(true);
          return;
        }
        console.error('[CustomCamera] Erro Crítico ao iniciar câmera:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        // Erro na inicialização: tenta parar para liberar o hardware e fecha
        forceStop();
        onClose();
      }
    };

    startCamera();

    // Cleanup incondicional: libera o hardware SEMPRE que o componente desmontar,
    // não importa se stopCamera() já foi chamado antes. Sem isso, o hardware
    // fica travado e impede reabertura da câmera.
    return () => {
      document.body.classList.remove("camera-active");
      try {
        CameraPreview.stop().catch(() => {});
      } catch (e) {
        /* ignora erros no stop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * forceStop: para o hardware incondicionalmente (ignora stoppedRef).
   * Usado APENAS no cleanup do useEffect para garantir liberação do hardware.
   */
  const forceStop = () => {
    stoppedRef.current = true;
    document.body.classList.remove("camera-active");
    try {
      CameraPreview.stop().catch(() => {});
    } catch (e) {
      /* ignora erros no stop */
    }
  };

  /**
   * stopCamera: parada controlada — respeitada stoppedRef para evitar dupla parada
   * em fluxos normais (captura bem-sucedida, botão fechar).
   */
  const stopCamera = async () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    try {
      await CameraPreview.stop();
    } catch (_) { /* já parada */ }
    document.body.classList.remove("camera-active");
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
      // quality: 60 + width: 800 — compressão nativa em hardware antes de serializar
      // para base64. Sem width, a foto vem em resolução máxima nativa e estoura
      // a RAM da WebView ao processar no Canvas (OOM crash).
      const result = await CameraPreview.capture({ quality: 60, width: 800 });
      const base64 = result?.value;
      if (!base64) throw new Error("Captura retornou vazia.");

      // Captura OK: para câmera e entrega base64 ao pai
      await stopCamera();
      onCapture(base64);
    } catch (err) {
      // IMPORTANTE: em caso de erro, NÃO fechar a câmera nem desmontar o componente.
      // O usuário deve poder clicar novamente sem precisar reabrir o modal.
      const errMsg = err?.message || JSON.stringify(err) || "Erro desconhecido";
      console.error("[CustomCamera] Falha na captura:", errMsg, err);
      setIsCapturing(false); // libera o botão para nova tentativa
      alert(
        "⚠️ Erro ao capturar foto. Tente novamente.\n" +
        "(Detalhe técnico: " + errMsg + ")"
      );
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
