import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Trash2, Save } from 'lucide-react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import './PreviewFotoModal.css';

const PreviewFotoModal = ({ isOpen, onClose, imageUri, unitInfo, onRetake, onDelete, onSaveReading, initialValue = '' }) => {
  const [leituraValor, setLeituraValor] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const formatarComMascara = (val) => {
    if (!val) return '';
    let num = String(val).replace(/\D/g, '');
    if (!num) return '';
    num = parseInt(num, 10).toString();
    num = num.padStart(4, '0');
    const intPart = num.slice(0, -3);
    const decPart = num.slice(-3);
    return `${intPart},${decPart}`;
  };

  const handleInputChange = (e) => {
    let num = e.target.value.replace(/\D/g, '');
    if (!num) {
      setLeituraValor('');
      return;
    }
    num = parseInt(num, 10).toString();
    num = num.padStart(4, '0');
    const intPart = num.slice(0, -3);
    const decPart = num.slice(-3);
    setLeituraValor(`${intPart},${decPart}`);
  };

  // Garante sincronização com o valor inicial formatado ao abrir
  useEffect(() => {
    if (isOpen) {
      setLeituraValor(initialValue ? formatarComMascara(initialValue) : '');
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!leituraValor || isSaving) return;

    setIsSaving(true);
    try {
      await onSaveReading(leituraValor);
      setLeituraValor('');
      onClose();
    } catch (error) {
      console.error('Erro ao salvar leitura:', error);
      alert('Erro ao sincronizar leitura: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="preview-foto-overlay" onClick={onClose}>
      <div className="preview-foto-container" onClick={(e) => e.stopPropagation()}>
        <header className="preview-foto-header">
          <h3>{unitInfo}</h3>
          <button type="button" className="btn-close" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="preview-foto-body">
          <div className="preview-img-container">
            <Zoom>
              <img src={imageUri} alt="Preview do Medidor" className="preview-full-img" />
            </Zoom>
          </div>

          <div className="reading-input-container">
            <label htmlFor="leitura-atual">Lançar Leitura Atual</label>
            <input
              id="leitura-atual"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={leituraValor}
              onChange={handleInputChange}
              placeholder="0,000"
              className="reading-input-field"
            />
          </div>

          <div className="footer-actions-row secondary-actions">
            <button type="button" className="btn-refazer" onClick={onRetake} disabled={isSaving}>
              <RefreshCw size={18} /> Refazer Foto
            </button>
            <button type="button" className="btn-excluir" onClick={onDelete} disabled={isSaving}>
              <Trash2 size={18} /> Excluir
            </button>
          </div>
        </div>

        <footer className="preview-foto-footer">
          <button
            type="button"
            className="btn-concluir-leitura"
            onClick={handleSave}
            disabled={!leituraValor || isSaving}
          >
            <Save size={20} />
            {isSaving ? 'Salvando...' : 'Salvar / Concluir Leitura'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PreviewFotoModal;
