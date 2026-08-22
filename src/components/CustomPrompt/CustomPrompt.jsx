import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './CustomPrompt.css';

const ConfirmModal = ({ title, message, onResolve }) => {
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
            Confirmar Envio
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
