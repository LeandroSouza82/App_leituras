import { customAlert, customConfirm } from '../../components/CustomPrompt/CustomPrompt';
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { X, Camera as CameraIcon } from "lucide-react";
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

const CustomCamera = ({ onSaveReading, onClose, initialValue = "", leituras = {}, unidadeAtiva = '' }) => {
  const leituraAnterior = leituras?.[unidadeAtiva] ?? 0;
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [leituraValue, setLeituraValue] = useState('');
  const [erroValidacao, setErroValidacao] = useState("");
  const [isZoomed, setIsZoomed] = useState(false);
  
  const isNative = Capacitor.isNativePlatform();

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
    const strValue = intValue.toString().padStart(5, "0");
    const inteiros = strValue.slice(0, -4);
    const decimais = strValue.slice(-4);
    const novoValor = `${inteiros},${decimais}`;
    setLeituraValue(novoValor);

    if (leituraAnterior) {
      const valorAtualFloat = parseFloat(`${inteiros}.${decimais}`);
      const valorAnteriorFloat = parseFloat(String(leituraAnterior).replace(',', '.'));
      if (!isNaN(valorAtualFloat) && !isNaN(valorAnteriorFloat) && valorAtualFloat < valorAnteriorFloat) {
        setErroValidacao('A leitura não pode ser menor que o mês anterior');
      } else {
        setErroValidacao('');
      }
    } else {
      setErroValidacao('');
    }
  };

  useEffect(() => {
    if (leituraValue && leituraAnterior) {
      const valorAtualFloat = parseFloat(leituraValue.replace(',', '.'));
      const valorAnteriorFloat = parseFloat(String(leituraAnterior).replace(',', '.'));
      if (!isNaN(valorAtualFloat) && !isNaN(valorAnteriorFloat) && valorAtualFloat < valorAnteriorFloat) {
        setErroValidacao('A leitura não pode ser menor que o mês anterior');
      } else {
        setErroValidacao('');
      }
    }
  }, [leituraValue, leituraAnterior]);

  const handleCapture = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      let base64 = "";

      if (!isNative) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        base64 = gerarFotoMockBase64();
      } else {
        const result = await Camera.getPhoto({
          quality: 60,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera
        });
        base64 = result.base64String;
      }

      if (!base64) throw new Error("Captura retornou vazia.");

      setCapturedPhoto(base64);
    } catch (err) {
      const msg = err?.message || '';
      if (!msg.includes('User cancelled') && !msg.includes('cancel')) {
        await customAlert("⚠️ Erro ao capturar foto. Tente novamente.\n(Detalhe técnico: " + msg + ")");
      } else {
        if (!capturedPhoto) {
          onClose(); // Se cancelou e não tinha foto prévia, fecha o modal
        }
      }
    } finally {
      setIsCapturing(false);
    }
  };

  // Abre a câmera automaticamente na primeira renderização
  useEffect(() => {
    handleCapture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetake = () => {
    setCapturedPhoto(null);
    setLeituraValue('');
    setIsZoomed(false);
    handleCapture();
  };

  const handleSave = async () => {
    if (!leituraValue) {
      await customAlert("Por favor, insira o valor da leitura.");
      return;
    }
    onSaveReading(capturedPhoto, leituraValue);
  };

  const cameraContent = (
    <div className="custom-camera-root">
      {!capturedPhoto ? (
        <div className="camera-placeholder-screen">
          <button
            type="button"
            className="cam-btn-close"
            onClick={onClose}
            title="Fechar"
            style={{ position: 'absolute', top: 24, left: 20 }}
          >
            <X size={26} />
          </button>
          
          <div className="camera-prompt-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '20px', background: '#0f172a' }}>
            <p style={{ color: 'white', fontSize: '1.2rem', fontWeight: 600 }}>Câmera pronta</p>
            <button
              type="button"
              className="btn-launch-camera"
              onClick={handleCapture}
              disabled={isCapturing}
              style={{ padding: '16px 24px', borderRadius: '12px', background: '#3b82f6', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
            >
              <CameraIcon size={32} />
              <span>{isCapturing ? "Abrindo..." : "Tirar Foto"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="input-overlay-card-wrapper" style={{ display: isZoomed ? 'none' : 'flex' }}>
          <div className="input-overlay-card" style={{ pointerEvents: 'auto' }}>
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
              
              <div className="bg-slate-50 p-2 rounded-md mb-2 border border-slate-200" style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', marginBottom: '8px' }}>
                <p className="text-sm text-gray-600 font-medium" style={{ fontSize: '13px', color: '#475569' }}>
                  Leitura Anterior: <strong>{leituraAnterior !== null && leituraAnterior !== undefined ? Number(leituraAnterior).toFixed(4).replace('.', ',') : '0,0000'}</strong>
                </p>
                {leituraValue && (() => {
                  const atualFloat = parseFloat(leituraValue.replace(',', '.'));
                  const anteriorFloat = parseFloat(String(leituraAnterior || 0).replace(',', '.'));
                  if (!isNaN(atualFloat) && !isNaN(anteriorFloat) && atualFloat >= anteriorFloat) {
                    const consumo = (atualFloat - anteriorFloat).toFixed(4);
                    return (
                      <p className="text-sm font-semibold text-blue-600 mt-1" style={{ fontSize: '13px', color: '#2563eb', marginTop: '4px' }}>
                        Consumo Calculado: <strong>{consumo.replace('.', ',')} m³</strong>
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              <input
                type="tel"
                className={`reading-input ${erroValidacao ? 'border-red-500' : ''}`}
                style={erroValidacao ? { borderColor: '#ef4444' } : {}}
                placeholder="0,0000"
                value={leituraValue}
                onChange={handleLeituraChange}
                autoFocus
              />
              {erroValidacao && (
                <span className="text-xs text-red-500 mt-1" style={{ fontSize: '12px', color: '#ef4444', display: 'block', marginTop: '4px' }}>
                  {erroValidacao}
                </span>
              )}
            </div>

            <div className="overlay-footer">
              <button 
                type="button" 
                className={`btn-save-reading ${erroValidacao ? 'opacity-50 cursor-not-allowed' : ''}`} 
                onClick={handleSave}
                disabled={!leituraValue || !!erroValidacao}
                style={erroValidacao ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              >
                Salvar / Concluir Leitura
              </button>
            </div>
            <button
              type="button"
              className="cam-btn-close-bottom"
              onClick={onClose}
              title="Cancelar"
              style={{ marginTop: '8px', background: 'transparent', color: '#64748b', border: 'none', padding: '12px', cursor: 'pointer', fontWeight: 600, alignSelf: 'center', fontSize: '0.9rem' }}
            >
              Cancelar
            </button>
          </div>
        </div>
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
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(cameraContent, document.body)
    : cameraContent;
};

export default CustomCamera;
