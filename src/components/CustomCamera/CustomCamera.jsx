import { customAlert, customConfirm } from '../../components/CustomPrompt/CustomPrompt';
import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { X, Camera as CameraIcon } from "lucide-react";
import { parseLeituraNumerica, formatarLeitura4Casas, formatarDigitosLeitura, calcularPosicaoCursor, aplicarMascaraLeitura } from '../../utils/leituraNumerica';
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

  // Mostrador
  ctx.beginPath();
  ctx.arc(400, 300, 190, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Display digital (Simulação de números pretos e vermelhos)
  ctx.fillStyle = "#000000";
  ctx.fillRect(260, 230, 280, 70);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px monospace";
  const numRandom = Math.floor(100000 + Math.random() * 900000).toString();
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
  const objOuVal = leituras?.[unidadeAtiva];
  const leituraAnterior = (typeof objOuVal === 'object' && objOuVal !== null) ? (objOuVal.leitura_anterior ?? null) : (objOuVal ?? null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [leituraValue, setLeituraValue] = useState('');
  const [erroValidacao, setErroValidacao] = useState("");
  const [isZoomed, setIsZoomed] = useState(false);
  const inputRef = useRef(null);
  
  const isNative = Capacitor.isNativePlatform();

  const validarLeitura = (valor) => {
    if (leituraAnterior !== null && leituraAnterior !== undefined) {
      const valorAtualFloat = parseLeituraNumerica(valor);
      const valorAnteriorFloat = parseLeituraNumerica(leituraAnterior);
      if (valorAtualFloat !== null && valorAnteriorFloat !== null && valorAtualFloat < valorAnteriorFloat) {
        setErroValidacao('A leitura não pode ser menor que o mês anterior');
      } else {
        setErroValidacao('');
      }
    } else {
      setErroValidacao('');
    }
  };

  const handleLeituraChange = (e) => {
    const rawValue = e.target.value;
    if (!rawValue) {
      setLeituraValue("");
      setErroValidacao("");
      return;
    }

    const input = e.target;
    const cursor = input.selectionStart || 0;
    const textBeforeCursor = rawValue.slice(0, cursor);
    const digitsBeforeCursor = textBeforeCursor.replace(/\D/g, '').length;
    const totalDigits = rawValue.replace(/\D/g, '').length;

    let formatted = '';
    if (!leituraValue && (rawValue.includes('.') || rawValue.includes(','))) {
      formatted = aplicarMascaraLeitura(rawValue);
    } else {
      formatted = formatarDigitosLeitura(rawValue);
    }

    setLeituraValue(formatted);
    validarLeitura(formatted);

    const newPos = calcularPosicaoCursor(formatted, digitsBeforeCursor, totalDigits);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const { selectionStart, selectionEnd, value } = input;
      if (selectionStart === selectionEnd && selectionStart > 0) {
        const charBefore = value[selectionStart - 1];
        if (charBefore === ',' || charBefore === '.') {
          e.preventDefault();
          const posToDelete = selectionStart - 2;
          if (posToDelete >= 0) {
            const newValue = value.slice(0, posToDelete) + value.slice(selectionStart - 1);
            const digitsBefore = value.slice(0, posToDelete).replace(/\D/g, '').length;
            const totalDigits = newValue.replace(/\D/g, '').length;
            const formatted = formatarDigitosLeitura(newValue);
            const newPos = calcularPosicaoCursor(formatted, digitsBefore, totalDigits);
            setLeituraValue(formatted);
            validarLeitura(formatted);
            requestAnimationFrame(() => {
              if (inputRef.current) {
                inputRef.current.setSelectionRange(newPos, newPos);
              }
            });
          }
        }
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData?.getData('text') || '';
    const trimmed = pasted.trim();
    if (!trimmed) return;

    const formatted = aplicarMascaraLeitura(trimmed);
    if (formatted) {
      setLeituraValue(formatted);
      validarLeitura(formatted);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(formatted.length, formatted.length);
        }
      });
    }
  };

  useEffect(() => {
    const formattedInitial = initialValue ? aplicarMascaraLeitura(initialValue) : '';
    setLeituraValue(formattedInitial);
    if (formattedInitial) {
      validarLeitura(formattedInitial);
    } else {
      setErroValidacao('');
    }
  }, [initialValue, leituraAnterior]);

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
                  Leitura Anterior: <strong>{leituraAnterior !== null && leituraAnterior !== undefined ? formatarLeitura4Casas(leituraAnterior) : '0,0000'}</strong>
                </p>
                {leituraValue && (() => {
                  const atualFloat = parseLeituraNumerica(leituraValue);
                  const anteriorFloat = parseLeituraNumerica(leituraAnterior !== null && leituraAnterior !== undefined ? leituraAnterior : 0);
                  if (atualFloat !== null && anteriorFloat !== null && atualFloat >= anteriorFloat) {
                    const consumo = atualFloat - anteriorFloat;
                    return (
                      <p className="text-sm font-semibold text-blue-600 mt-1" style={{ fontSize: '13px', color: '#2563eb', marginTop: '4px' }}>
                        Consumo Calculado: <strong>{formatarLeitura4Casas(consumo)} m³</strong>
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={`reading-input ${erroValidacao ? 'border-red-500' : ''}`}
                style={erroValidacao ? { borderColor: '#ef4444' } : {}}
                placeholder="Digite a leitura..."
                value={leituraValue}
                onChange={handleLeituraChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                autoFocus
                autoComplete="off"
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
