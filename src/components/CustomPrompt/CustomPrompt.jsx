import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ModalConfirmacaoDestrutiva from '../ModalConfirmacaoDestrutiva/ModalConfirmacaoDestrutiva';
import './CustomPrompt.css';

const ConfirmModal = ({ title, message, onResolve }) => {
  const labelConfirmar = title && title.toLowerCase().includes('excluir') ? 'Excluir' : 'Confirmar';

  return (
    <div className="custom-prompt-overlay" onClick={() => onResolve(false)}>
      <div 
        className="custom-prompt-container" 
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="custom-prompt-title">{title || 'Confirmação'}</h2>
        <p className="custom-prompt-message">{message}</p>
        
        <div className="custom-prompt-actions">
          <button 
            type="button" 
            className="custom-prompt-btn-cancelar" 
            onClick={() => onResolve(false)}
          >
            Cancelar
          </button>
          <button 
            type="button" 
            className="custom-prompt-btn-confirmar"
            onClick={() => onResolve(true)}
          >
            {labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};

const PromptModal = ({ title, message, defaultValue, onResolve }) => {
  const [value, setValue] = useState(defaultValue || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    onResolve(value);
  };

  return (
    <div className="custom-prompt-overlay" onClick={() => onResolve(null)}>
      <form 
        className="custom-prompt-container" 
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="custom-prompt-title">{title || 'Confirmar Nome do Condomínio'}</h2>
        <p className="custom-prompt-message">{message}</p>
        
        <input 
          className="custom-prompt-input"
          value={value} 
          onChange={(e) => setValue(e.target.value)} 
          autoFocus 
          type="text"
        />
        
        <div className="custom-prompt-actions">
          <button 
            type="button" 
            className="custom-prompt-btn-cancelar" 
            onClick={() => onResolve(null)}
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            className="custom-prompt-btn-confirmar"
          >
            Confirmar / OK
          </button>
        </div>
      </form>
    </div>
  );
};

export const customPrompt = (message, defaultValue = '', title = 'Confirmar Nome do Condomínio') => {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    // Suporte ao React 18 createRoot
    const root = createRoot(container);

    const handleResolve = (result) => {
      root.unmount();
      container.remove();
      resolve(result);
    };

    root.render(
      <PromptModal 
        title={title} 
        message={message} 
        defaultValue={defaultValue} 
        onResolve={handleResolve} 
      />
    );
  });
};

export const customConfirm = (message, title = 'Confirmar Ação') => {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleResolve = (result) => {
      root.unmount();
      container.remove();
      resolve(result);
    };

    root.render(
      <ConfirmModal 
        title={title} 
        message={message} 
        onResolve={handleResolve} 
      />
    );
  });
};

export const customConfirmDestrutivo = (message, title = 'Excluir', textoConfirmar = null) => {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleResolve = (result) => {
      root.unmount();
      container.remove();
      resolve(result);
    };

    let btnText = textoConfirmar;
    if (!btnText) {
      const titleLower = (title || '').toLowerCase();
      if (titleLower.includes('remover')) btnText = 'Remover';
      else if (titleLower.includes('apagar')) btnText = 'Apagar';
      else if (titleLower.includes('limpar')) btnText = 'Limpar';
      else btnText = 'Excluir';
    }

    root.render(
      <ModalConfirmacaoDestrutiva 
        isOpen={true}
        titulo={title} 
        mensagem={message} 
        onConfirm={() => handleResolve(true)}
        onCancel={() => handleResolve(false)}
        textoConfirmar={btnText}
      />
    );
  });
};

const AlertModal = ({ title, message, onResolve }) => {
  return (
    <div className="custom-prompt-overlay" onClick={() => onResolve(true)}>
      <div 
        className="custom-prompt-container" 
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="custom-prompt-title">{title || 'Aviso'}</h2>
        <p className="custom-prompt-message">{message}</p>
        
        <div className="custom-prompt-actions" style={{ justifyContent: 'center' }}>
          <button 
            type="button" 
            className="custom-prompt-btn-confirmar"
            onClick={() => onResolve(true)}
            style={{ width: '100%' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export const customAlert = (message, title = 'Aviso') => {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleResolve = (result) => {
      root.unmount();
      container.remove();
      resolve(result);
    };

    root.render(
      <AlertModal 
        title={title} 
        message={message} 
        onResolve={handleResolve} 
      />
    );
  });
};
