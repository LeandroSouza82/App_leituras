import React, { useEffect, useRef, useState } from "react";
import { CameraPreview } from "@capacitor-community/camera-preview";
import { Capacitor } from "@capacitor/core";
import { X, Camera, RefreshCw, Eye } from "lucide-react";
import "./CustomCamera.css";

/**
 * Gera uma imagem simulada de alta qualidade de um medidor/hidrômetro em Base64
 * para permitir testes completos no navegador sem hardware nativo.
 */
const gerarFotoMockBase64 = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");

  // Fundo metálico / industrial
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 800, 600);

  // Corpo do medidor (círculo principal)
  ctx.beginPath();
  ctx.arc(400, 300, 220, 0, Math.PI * 2);
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#0284c7";
  ctx.stroke();

  // Mostrador interno
  ctx.beginPath();
  ctx.arc(400, 300, 190, 0, Math.PI * 2);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();

  // Visor numérico (odômetro)
  ctx.fillStyle = "#000000";
  ctx.fillRect(260, 240, 280, 70);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 3;
  ctx.strokeRect(260, 240, 280, 70);

  // Dígitos gerados
  const numRandom = String(Math.floor(10000 + Math.random() * 90000));
  ctx.font = "bold 38px 'Courier New', monospace";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`00${numRandom.slice(0, 3)},${numRandom.slice(3)} m³`, 400, 275);

  // Detalhes do medidor
  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("MEDIDOR DE CONSUMO", 400, 190);
  ctx.font = "14px sans-serif";
  ctx.fillText("Qn 1.5 m³/h - CLASSE B", 400, 360);

  // Ponteiro simulado
  ctx.beginPath();
  ctx.arc(400, 420, 30, 0, Math.PI * 2);
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(400, 420);
  ctx.lineTo(418, 405);
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Retorna base64 puro (sem prefixo data:)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1];
};

/**
 * CustomCamera — câmera in-app estilo uCondo com suporte a Preview Nativo e Simulador Web.
 *
 * Props:
 *   onCapture(base64: string) — chamado após captura bem-sucedida
 *   onClose()                 — chamado ao fechar sem capturar
 */
const CustomCamera = ({ onCapture, onClose }) => {
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const stoppedRef = useRef(false);

  // ─── Inicializa a câmera ao montar ───────────────────────────────────────
  useEffect(() => {
    stoppedRef.current = false;

    if (!isNative) {
      // No Browser / Web: Simulador ativo imediatamente
      console.log("[CustomCamera] Rodando em ambiente Web. Simulador de câmera ativo.");
      setIsReady(true);
      return;
    }

    // No Ambiente Nativo: Ativa transparência no WebView
    document.documentElement.classList.add("camera-active");
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
        if (err?.message === "camera already started" || err?.message?.includes("already started")) {
          console.log("[CustomCamera] Câmera já estava rodando em background. Prosseguindo.");
          setIsReady(true);
          return;
        }
        console.error("[CustomCamera] Erro Crítico ao iniciar câmera:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
        forceStop();
        onClose();
      }
    };

    startCamera();

    // Cleanup incondicional ao desmontar
    return () => {
      document.documentElement.classList.remove("camera-active");
      document.body.classList.remove("camera-active");
      if (isNative) {
        try {
          CameraPreview.stop().catch(() => {});
        } catch (e) {
          /* ignora erros de stop */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const forceStop = () => {
    stoppedRef.current = true;
    document.documentElement.classList.remove("camera-active");
    document.body.classList.remove("camera-active");
    if (isNative) {
      try {
        CameraPreview.stop().catch(() => {});
      } catch (e) {
        /* ignora */
      }
    }
  };

  const stopCamera = async () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    document.documentElement.classList.remove("camera-active");
    document.body.classList.remove("camera-active");
    if (isNative) {
      try {
        await CameraPreview.stop();
      } catch (_) {
        /* já parada */
      }
    }
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
      let base64 = "";

      if (!isNative) {
        // Modo Web Mock: Gera imagem simulada
        await new Promise((resolve) => setTimeout(resolve, 200)); // feedback visual
        base64 = gerarFotoMockBase64();
      } else {
        // Modo Nativo Android/iOS
        const result = await CameraPreview.capture({ quality: 60, width: 800 });
        base64 = result?.value;
      }

      if (!base64) throw new Error("Captura retornou vazia.");

      await stopCamera();
      onCapture(base64);
    } catch (err) {
      const errMsg = err?.message || JSON.stringify(err) || "Erro desconhecido";
      console.error("[CustomCamera] Falha na captura:", errMsg, err);
      setIsCapturing(false);
      alert("⚠️ Erro ao capturar foto. Tente novamente.\n(Detalhe técnico: " + errMsg + ")");
    }
  };

  // ─── Virar câmera ────────────────────────────────────────────────────────
  const handleFlip = async () => {
    if (!isReady || isCapturing) return;
    if (!isNative) {
      alert("Troca de câmera simulada (Modo Web)");
      return;
    }
    try {
      await CameraPreview.flip();
    } catch (err) {
      console.error("[CustomCamera] Erro ao virar câmera:", err);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="custom-camera-root" id="custom-camera-preview">
      {/* Simulador visual de viewfinder para ambiente Web */}
      {!isNative && (
        <div className="web-camera-simulator">
          <div className="web-sim-badge">
            <span>🌐 SIMULADOR DE CÂMERA (WEB)</span>
          </div>
          <div className="camera-viewfinder-frame">
            <Eye size={40} />
            <span>Enquadre o Medidor</span>
          </div>
        </div>
      )}

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

      {/* Indicador de carregamento no ambiente nativo */}
      {isNative && !isReady && (
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

        <div className="cam-btn cam-btn-placeholder" aria-hidden="true" />
      </footer>
    </div>
  );
};

export default CustomCamera;
