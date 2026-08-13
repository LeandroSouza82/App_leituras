import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Trash2, CheckCircle2, Save } from 'lucide-react';
import './PreviewFotoModal.css';

const PreviewFotoModal = ({ isOpen, onClose, imageUri, unitInfo, onRetake, onDelete, onSaveReading, initialValue = '' }) => {
  const [leituraValor, setLeituraValor] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);

  // Garante que o campo esteja limpo ou sincronizado com o valor inicial ao abrir/mudar de unidade
  useEffect(() => {
    if (isOpen) {
      setLeituraValor(initialValue);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!leituraValor || isSaving) return;

    setIsSaving(true);
    try {
      await onSaveReading(leituraValor);
      // Limpeza imediata após o salvamento bem-sucedido
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
            <img src={imageUri} alt="Preview do Medidor" className="preview-full-img" />
          </div>

          <div className="reading-input-container">
            <label htmlFor="leitura-atual">Lançar Leitura Atual</label>
            <input
              id="leitura-atual"
              type="number"
              step="any"
              inputMode="decimal"
              value={leituraValor}
              onChange={(e) => setLeituraValor(e.target.value)}
              placeholder="0.000"
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
