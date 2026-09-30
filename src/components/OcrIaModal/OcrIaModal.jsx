import React, { useState, useEffect } from 'react';
import { X, ScanText, AlertTriangle } from 'lucide-react';
import { isOcrAtivo, setOcrAtivo } from '../../utils/ocrConfig';
import './OcrIaModal.css';

/**
 * OcrIaModal — Configuração "OCR + IA"
 *
 * Etapa 1: somente OCR offline via ML Kit.
 * IA online ainda não está disponível.
 */
const OcrIaModal = ({ isOpen, onClose }) => {
  const [ocrAtivo, setOcrAtivoLocal] = useState(false);

  // Sincroniza com a preferência persistida ao abrir
  useEffect(() => {
    if (isOpen) {
      setOcrAtivoLocal(isOcrAtivo());
    }
  }, [isOpen]);

  const handleToggle = () => {
    const novoValor = !ocrAtivo;
    setOcrAtivoLocal(novoValor);
    setOcrAtivo(novoValor);
  };

  if (!isOpen) return null;

  return (
    <div className="ocr-modal-overlay" onClick={onClose}>
      <div className="ocr-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <header className="ocr-modal-header">
          <div className="ocr-modal-title-row">
            <div className="ocr-modal-icon-wrap">
              <ScanText size={20} />
            </div>
            <div>
              <h2 className="ocr-modal-title">OCR + IA</h2>
              <p className="ocr-modal-subtitle">Reconhecimento automático de leitura</p>
            </div>
          </div>
          <button
            type="button"
            className="ocr-btn-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </header>

        {/* Corpo */}
        <div className="ocr-modal-body">

          {/* Aviso obrigatório */}
          <div className="ocr-aviso-importante">
            <AlertTriangle size={16} className="ocr-aviso-icon" />
            <p>
              O reconhecimento pode cometer erros. Confira a leitura no medidor
              antes de salvar. <strong>A confirmação final é sempre do leiturista.</strong>
            </p>
          </div>

          {/* Toggle OCR offline */}
          <div className="ocr-toggle-row">
            <div className="ocr-toggle-info">
              <span className="ocr-toggle-label">OCR Offline</span>
              <span className="ocr-toggle-desc">
                Reconhece a leitura diretamente no aparelho, sem internet.
                O modelo está incluído no aplicativo desde a instalação.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={ocrAtivo}
              className={`ocr-toggle-btn ${ocrAtivo ? 'ocr-toggle-btn--on' : ''}`}
              onClick={handleToggle}
            >
              <span className="ocr-toggle-knob" />
            </button>
          </div>

          {/* Informativo de IA */}
          <div className="ocr-ia-info">
            <p className="ocr-ia-info-title">IA Online</p>
            <p className="ocr-ia-info-text">
              A integração com inteligência artificial online ainda não está
              disponível nesta versão. Nenhuma foto é enviada para serviços
              externos nesta etapa.
            </p>
          </div>

          {/* Informativo de uso */}
          {ocrAtivo && (
            <div className="ocr-uso-info">
              <p>
                Quando ativo: após a foto, o campo receberá uma sugestão
                automática. Verifique o medidor, corrija se necessário e
                salve normalmente.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <footer className="ocr-modal-footer">
          <button
            type="button"
            className="ocr-btn-fechar"
            onClick={onClose}
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
};

export default OcrIaModal;
