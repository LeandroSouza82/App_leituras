import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Trash2, Save, RotateCcw } from 'lucide-react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import './PreviewFotoModal.css';

const PreviewFotoModal = ({ isOpen, onClose, imageUri, unitInfo, onRetake, onDelete, onSaveReading, initialValue = '', leituraAnterior = null }) => {
  const [leituraValor, setLeituraValor] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [erroValidacao, setErroValidacao] = useState('');

  const formatarComMascara = (val) => {
    if (!val) return '';
    let num = String(val).replace(/\D/g, '');
    if (!num) return '';
    num = parseInt(num, 10).toString();
    num = num.padStart(5, '0');
    const intPart = num.slice(0, -4);
    const decPart = num.slice(-4);
    return `${intPart},${decPart}`;
  };

  const handleInputChange = (e) => {
    let num = e.target.value.replace(/\D/g, '');
    if (!num) {
      setLeituraValor('');
      return;
    }
    num = parseInt(num, 10).toString();
    num = num.padStart(5, '0');
    const intPart = num.slice(0, -4);
    const decPart = num.slice(-4);
    const novoValor = `${intPart},${decPart}`;
    setLeituraValor(novoValor);

    if (leituraAnterior) {
      const valorAtualFloat = parseFloat(`${intPart}.${decPart}`);
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

  // Garante sincronização com o valor inicial formatado ao abrir
  useEffect(() => {
    if (isOpen) {
      const valorFormatado = initialValue ? formatarComMascara(initialValue) : '';
      setLeituraValor(valorFormatado);
      
      if (valorFormatado && leituraAnterior) {
        const valorAtualFloat = parseFloat(valorFormatado.replace(',', '.'));
        const valorAnteriorFloat = parseFloat(String(leituraAnterior).replace(',', '.'));
        if (!isNaN(valorAtualFloat) && !isNaN(valorAnteriorFloat) && valorAtualFloat < valorAnteriorFloat) {
          setErroValidacao('A leitura não pode ser menor que o mês anterior');
        } else {
          setErroValidacao('');
        }
      } else {
        setErroValidacao('');
      }
    }
  }, [isOpen, initialValue, leituraAnterior]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!leituraValor || isSaving) return;

    setIsSaving(true);
    try {
      await onSaveReading(leituraValor);
      setLeituraValor('');
      onClose();
    } catch (error) {
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
          {/* Imagem com botões flutuantes sobrepostos */}
          <div className="preview-img-wrapper">
            <Zoom>
              <img src={imageUri} alt="Preview do Medidor" className="preview-full-img" />
            </Zoom>

            {/* Botões flutuantes estilo uCondo */}
            <div className="preview-floating-actions">
              <button
                type="button"
                className="btn-floating btn-floating-retake"
                onClick={onRetake}
                disabled={isSaving}
                title="Refazer foto"
              >
                <RotateCcw size={16} />
                <span>Alterar</span>
              </button>
              <button
                type="button"
                className="btn-floating btn-floating-delete"
                onClick={onDelete}
                disabled={isSaving}
                title="Excluir foto"
              >
                <Trash2 size={16} />
                <span>Excluir</span>
              </button>
            </div>
          </div>

          <div className="reading-input-container">
            <label htmlFor="leitura-atual" style={{ textTransform: 'uppercase' }}>LANÇAR LEITURA ATUAL</label>
            
            <div className="bg-slate-50 p-2 rounded-md mb-2 border border-slate-200" style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', marginBottom: '8px' }}>
              <p className="text-sm text-gray-600 font-medium" style={{ fontSize: '13px', color: '#475569' }}>
                Leitura Anterior: <strong>{leituraAnterior !== null && leituraAnterior !== undefined ? leituraAnterior : '0,0000'}</strong>
              </p>
              {leituraValor && (() => {
                const atualFloat = parseFloat(leituraValor.replace(',', '.'));
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
              id="leitura-atual"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={leituraValor}
              onChange={handleInputChange}
              placeholder="0,0000"
              className={`reading-input-field ${erroValidacao ? 'border-red-500' : ''}`}
              style={erroValidacao ? { borderColor: '#ef4444' } : {}}
            />
            {erroValidacao && (
              <span className="text-xs text-red-500 mt-1" style={{ fontSize: '12px', color: '#ef4444', display: 'block', marginTop: '4px' }}>
                {erroValidacao}
              </span>
            )}
          </div>
        </div>

        <footer className="preview-foto-footer">
          <button
            type="button"
            className={`btn-concluir-leitura ${erroValidacao ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleSave}
            disabled={!leituraValor || isSaving || !!erroValidacao}
            style={erroValidacao ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
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
