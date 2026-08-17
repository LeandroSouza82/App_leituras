import React from 'react';
import { X, Layers } from 'lucide-react';
import './SideMenu.css';

const SideMenu = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="side-menu-overlay" onClick={onClose}>
      <aside className="side-menu-container" onClick={(e) => e.stopPropagation()}>
        <header className="side-menu-header">
          <div className="side-menu-brand">
            <div className="side-menu-logo">
              <Layers size={22} color="#ffffff" />
            </div>
            <div>
              <h3>Fast Leituras</h3>
              <p>Menu do Aplicativo</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-close-side-menu"
            onClick={onClose}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </header>

        <div className="side-menu-content">
          <div className="side-menu-section-title">Ações e Configurações</div>
          <ul className="side-menu-list">
            {/* Itens do menu */}
          </ul>
        </div>

        <footer className="side-menu-footer">
          <p className="side-menu-version">Versão 1.0.1 • Fast Leituras</p>
        </footer>
      </aside>
    </div>
  );
};

export default SideMenu;
