import React from 'react';
import { X, Layers, LogOut, FolderSync } from 'lucide-react';
import { supabase } from '../../services/supabase';
import './SideMenu.css';

const SideMenu = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleLogout = async () => {
    if (!window.confirm('Deseja realmente sair da sua conta?')) return;

    try {
      if (supabase) {
        await supabase.auth.signOut();
      }

      sessionStorage.removeItem('leituras-alerta-aberto');
      onClose();

      // Redireciona para acionar o ciclo natural de autenticação (Splash -> Login)
      window.location.href = '/';
    } catch (error) {
      console.error('[SideMenu] Erro ao fazer logout:', error);
      window.location.href = '/';
    }
  };

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
            {/* Outras opções de navegação futuramente */}
          </ul>
        </div>

        <footer className="side-menu-footer">
          <button
            type="button"
            className="btn-side-menu-logout"
            onClick={handleLogout}
            title="Sair da conta"
          >
            <LogOut size={18} />
            <span>Sair da conta</span>
          </button>
          <p className="side-menu-version">Versão 1.0.1 • Fast Leituras</p>
        </footer>
      </aside>
    </div>
  );
};

export default SideMenu;
