import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  LogOut, 
  Camera, 
  User, 
  Settings, 
  ShieldCheck, 
  Headset, 
  Star, 
  MessageSquare 
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import CameraSettingsModal from '../CameraSettingsModal/CameraSettingsModal';
import FeedbackModal from '../FeedbackModal/FeedbackModal';
import './SideMenu.css';
import { Browser } from '@capacitor/browser';

const SideMenu = ({ isOpen, onClose, onLogout, onNavigate }) => {
  const [isCameraModalOpen, setCameraModalOpen] = useState(false);
  const [isFeedbackModalOpen, setFeedbackModalOpen] = useState(false);

  const handleNavigatePerfil = () => {
    onClose();
    if (onNavigate) onNavigate('perfil');
  };

  const handleOpenPrivacy = async () => {
    try {
      await Browser.open({ url: 'https://fastleitura.appviper.com.br/privacidade' });
    } catch (err) {
      console.error('Erro ao abrir política de privacidade', err);
    }
  };

  const handleOpenSupport = async () => {
    try {
      await Browser.open({ url: 'https://wa.me/55SEUNUMERO?text=Preciso%20de%20ajuda%20no%20Fast%20Leituras' });
    } catch (err) {
      console.error('Erro ao abrir suporte', err);
    }
  };

  const handleOpenRating = async () => {
    try {
      await Browser.open({ url: 'market://details?id=com.fastleituras.app' });
    } catch (err) {
      console.error('Erro ao abrir loja', err);
    }
  };

  // Mapeamento das opções do menu movido para dentro do componente
  // para ter acesso às funções de state (setCameraModalOpen, setFeedbackModalOpen)
  const MENU_ITEMS = [
    { id: 'camera', label: 'Configurações da Câmera', icon: Camera, onClick: () => setCameraModalOpen(true) },
    { id: 'perfil', label: 'Meu Perfil e Conta', icon: User, onClick: handleNavigatePerfil },
    { id: 'prefs', label: 'Preferências do App', icon: Settings, onClick: () => {} },
    { id: 'privacy', label: 'Política de Privacidade e Termos', icon: ShieldCheck, onClick: handleOpenPrivacy },
    { id: 'support', label: 'Suporte Técnico', icon: Headset, onClick: handleOpenSupport },
    { id: 'rating', label: 'Avaliar o App', icon: Star, onClick: handleOpenRating },
    { id: 'feedback', label: 'Enviar Feedback', icon: MessageSquare, onClick: () => setFeedbackModalOpen(true) },
  ];

  if (!isOpen) return null;

  const handleLogout = async () => {
    if (!window.confirm('Deseja realmente sair da sua conta?')) return;
    
    if (onLogout) {
      await onLogout();
    }
  };

  return (
    <>
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
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button 
                      type="button" 
                      className="side-menu-item" 
                      onClick={item.onClick}
                    >
                      <Icon size={20} color="#64748b" />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
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

      <CameraSettingsModal 
        isOpen={isCameraModalOpen} 
        onClose={() => setCameraModalOpen(false)} 
      />

      <FeedbackModal 
        isOpen={isFeedbackModalOpen} 
        onClose={() => setFeedbackModalOpen(false)} 
      />
    </>
  );
};

export default SideMenu;
