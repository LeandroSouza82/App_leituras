import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CameraPreview } from "@capacitor-community/camera-preview";
import { Capacitor } from "@capacitor/core";
import { X, Camera, Eye, Zap } from "lucide-react";
import "./CustomCamera.css";

/**
 * Gera uma imagem simulada de medidor/hidrômetro em Base64
 * para permitir testes no navegador sem necessidade de hardware físico.
 */
const gerarFotoMockBase64 = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");

  // Fundo metálico / industrial
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 800, 600);

  // Corpo do medidor
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

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1];
};

/**
 * CustomCamera — câmera in-app com UI uCondo minimalista (Fechar + Capturar + Lanterna/Torch),
 * renderizada via Portal no document.body para isolamento absoluto de estilos e toques.
 *
 * Props:
 *   onCapture(base64: string) — chamado após captura bem-sucedida
 *   onClose()                 — chamado ao fechar sem capturar
 */
const CustomCamera = ({ onSaveReading, onClose, initialValue = "" }) => {
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const formatInitialValue = (val) => {
    if (!val) return "";
    const str = String(val).replace(",", ".");
    const num = parseFloat(str);
    if (isNaN(num)) return "";
    // Retorna com vírgula e 4 casas decimais (Padrão uCondo)
    return num.toFixed(4).replace(".", ",");
  };

  const [leituraValue, setLeituraValue] = useState(() => formatInitialValue(initialValue));
  const [isZoomed, setIsZoomed] = useState(false);
  
  const isNative = Capacitor.isNativePlatform();
  const stoppedRef = useRef(false);

  // ─── Formatação do Input (Padrão de Leitura: 4 Casas Decimais) ───────────
  const handleLeituraChange = (e) => {
    const rawValue = e.target.value.replace(/\D/g, "");
    if (!rawValue) {
      setLeituraValue("");
      return;
    }
    const intValue = parseInt(rawValue, 10);
    if (isNaN(intValue)) {
      setLeituraValue("");
      return;
    }
    // PadStart 5 para garantir pelo menos '0,000X'
    const strValue = intValue.toString().padStart(5, "0");
    const inteiros = strValue.slice(0, -4);
    const decimais = strValue.slice(-4);
    setLeituraValue(`${inteiros},${decimais}`);
  };

  // ─── Inicializa a câmera ao montar ───────────────────────────────────────
  useEffect(() => {
    stoppedRef.current = false;

    if (!isNative) {
      setIsReady(true);
      return;
    }

    // No Ambiente Nativo: Ativa transparência e esconde app-shell
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
          setIsReady(true);
          return;
        }
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
          CameraPreview.setFlashMode({ flashMode: "off" }).catch(() => {});
          CameraPreview.stop().catch(() => {});
        } catch (e) {
          /* ignora erros no stop */
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
        CameraPreview.setFlashMode({ flashMode: "off" }).catch(() => {});
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
        await CameraPreview.setFlashMode({ flashMode: "off" });
      } catch (_) {}
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

  // ─── Controle de Flash / Lanterna ─────────────────────────────────────────
  const toggleFlash = async () => {
    if (!isReady || isCapturing) return;
    const nextState = !isFlashOn;
    setIsFlashOn(nextState);

    if (!isNative) {
      return;
    }

    try {
      // 'torch' mantém a luz da lanterna acesa continuamente para iluminar o medidor escuro
      await CameraPreview.setFlashMode({ flashMode: nextState ? "torch" : "off" });
    } catch (err) {
      alert("Este dispositivo pode não suportar o controle de lanterna.");
      setIsFlashOn(false);
    }
  };

  // ─── Captura ─────────────────────────────────────────────────────────────
  const handleCapture = async (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!isReady || isCapturing) return;
    setIsCapturing(true);

    try {
      let base64 = "";

      if (!isNative) {
        // Modo Web Mock
        await new Promise((resolve) => setTimeout(resolve, 200));
        base64 = gerarFotoMockBase64();
      } else {
        // Modo Nativo Android/iOS - Compressão extrema para economizar espaço
        const result = await CameraPreview.capture({ quality: 20, width: 600 });
        base64 = result?.value;

        // Desliga a lanterna automaticamente após a captura da foto
        if (isFlashOn) {
          try {
            await CameraPreview.setFlashMode({ flashMode: "off" });
          } catch (_) {}
          setIsFlashOn(false);
        }
      }

      if (!base64) throw new Error("Captura retornou vazia.");

      // Em vez de fechar a câmera, exibimos o card de overlay com a foto capturada
      setCapturedPhoto(base64);
      setIsCapturing(false);
    } catch (err) {
      const errMsg = err?.message || JSON.stringify(err) || "Erro desconhecido";
      setIsCapturing(false);
      alert("⚠️ Erro ao capturar foto. Tente novamente.\n(Detalhe técnico: " + errMsg + ")");
    }
  };

  const handleRetake = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setCapturedPhoto(null);
    setLeituraValue(formatInitialValue(initialValue));
    setIsZoomed(false);
  };

  const handleSave = async (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!leituraValue) {
      alert("Por favor, insira o valor da leitura.");
      return;
    }

    // Paramos a câmera de forma definitiva apenas ao concluir
    await stopCamera();
    onSaveReading(capturedPhoto, leituraValue);
  };

  // ─── Conteúdo renderizado diretamente no body via Portal ──────────────────
  const cameraContent = (
    <div className="custom-camera-root" id="custom-camera-preview">
      {/* Fundo congelado da foto tirada (esconde o feed ao vivo sem dar stop) */}
      {capturedPhoto && !isNative && (
        <img 
          src={`data:image/jpeg;base64,${capturedPhoto}`} 
          alt="Frame Capturado" 
          className="captured-fullscreen-bg" 
        />
      )}
      {capturedPhoto && isNative && (
        <img 
          src={`data:image/jpeg;base64,${capturedPhoto}`} 
          alt="Frame Capturado" 
          className="captured-fullscreen-bg" 
        />
      )}

      {/* Overlay de Zoom */}
      {isZoomed && capturedPhoto && (
        <div className="zoom-overlay" onClick={() => setIsZoomed(false)}>
          <img 
            src={`data:image/jpeg;base64,${capturedPhoto}`} 
            alt="Foto Ampliada" 
            className="zoomed-image" 
          />
          <button type="button" className="btn-close-zoom" onClick={() => setIsZoomed(false)}>
            <X size={28} />
          </button>
        </div>
      )}

      {/* Simulador visual de viewfinder para ambiente Web */}
      {!isNative && !capturedPhoto && (
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

      {/* Botão Fechar (X) no topo esquerdo com alto contraste */}
      <button
        type="button"
        className="cam-btn cam-btn-close"
        onClick={stopAndClose}
        disabled={isCapturing}
        title="Fechar Câmera"
      >
        <X size={26} />
      </button>

      {/* Botão Flash / Lanterna (Raio) no topo direito - Escondido se foto já capturada */}
      {!capturedPhoto && (
        <button
          type="button"
          className={`cam-btn cam-btn-flash ${isFlashOn ? "flash-active" : ""}`}
          onClick={toggleFlash}
          disabled={!isReady || isCapturing}
          title={isFlashOn ? "Desativar Lanterna" : "Ativar Lanterna"}
        >
          <Zap
            size={24}
            color={isFlashOn ? "#facc15" : "#ffffff"}
            fill={isFlashOn ? "#facc15" : "none"}
          />
        </button>
      )}

      {/* Indicador de carregamento no ambiente nativo */}
      {isNative && !isReady && !capturedPhoto && (
        <div className="cam-loading">
          <span>Iniciando câmera…</span>
        </div>
      )}

      {/* Rodapé ou Card dependendo do estado */}
      {!capturedPhoto ? (
        <footer className="cam-footer">
          <button
            type="button"
            className={`cam-btn cam-btn-capture${isCapturing ? " capturing" : ""}`}
            onClick={handleCapture}
            disabled={!isReady || isCapturing}
            title="Capturar foto"
          >
            <Camera size={38} />
          </button>
        </footer>
      ) : (
        <div className="input-overlay-card-wrapper" style={{ display: isZoomed ? 'none' : 'flex' }}>
          <div className="input-overlay-card">
            <div className="overlay-header">
              <img 
                src={`data:image/jpeg;base64,${capturedPhoto}`} 
                alt="Miniatura capturada" 
                className="captured-thumbnail" 
                onClick={() => setIsZoomed(true)}
              />
              <button type="button" className="btn-retake" onClick={handleRetake}>
                Tirar de novo
              </button>
            </div>
            
            <div className="overlay-body">
              <label>LANÇAR LEITURA ATUAL</label>
              <input
                type="tel"
                className="reading-input"
                placeholder="0,0000"
                value={leituraValue}
                onChange={handleLeituraChange}
                autoFocus
              />
            </div>

            <div className="overlay-footer">
              <button type="button" className="btn-save-reading" onClick={handleSave}>
                Salvar / Concluir Leitura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Renderiza via Portal no body para garantir que nenhuma regra de ancestral afete a câmera
  return typeof document !== "undefined"
    ? createPortal(cameraContent, document.body)
    : cameraContent;
};

export default CustomCamera;
