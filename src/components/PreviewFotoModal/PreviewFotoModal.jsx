import React from 'react';
import { X, RefreshCw, Trash2 } from 'lucide-react';
import './PreviewFotoModal.css';

const PreviewFotoModal = ({ isOpen, onClose, imageUri, unitInfo, onRetake, onDelete }) => {
  if (!isOpen) return null;

  return (
    <div className="preview-foto-overlay" onClick={onClose}>
      <div className="preview-foto-container" onClick={(e) => e.stopPropagation()}>
        <header className="preview-foto-header">
          <h3>{unitInfo}</h3>
          <button type="button" className="btn-close" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="preview-foto-body">
          <img src={imageUri} alt="Preview do Medidor" className="preview-full-img" />
        </div>

        <footer className="preview-foto-footer">
          <button type="button" className="btn-refazer" onClick={onRetake}>
            <RefreshCw size={18} /> Refazer Foto
          </button>
          <button type="button" className="btn-excluir" onClick={onDelete}>
            <Trash2 size={18} /> Excluir
          </button>
          <button type="button" className="btn-fechar-preview" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PreviewFotoModal;
