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
  MessageSquare,
  Cloud,
  RefreshCw
} from 'lucide-react';
import { sincronizarFilaEmBackground } from '../../services/syncService';
import { supabase } from '../../services/supabase';
import { customAlert } from '../CustomPrompt/CustomPrompt';
import CameraSettingsModal from '../CameraSettingsModal/CameraSettingsModal';
import FeedbackModal from '../FeedbackModal/FeedbackModal';
import './SideMenu.css';
import { Browser } from '@capacitor/browser';
import { tituloLegal, ultimaAtualizacao, privacyAndTermsContent } from '../../content/legalContent';

const SideMenu = ({ isOpen, onClose, onLogout, onNavigate }) => {
  const [isCameraModalOpen, setCameraModalOpen] = useState(false);
  const [isFeedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleForceSync = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSyncing(true);
    try {
      await sincronizarFilaEmBackground();
      
      // FECHA O MODAL PRIMEIRO ANTES DE EXIBIR O ALERTA DE SUCESSO
      setShowSyncModal(false);
      
      await customAlert('Fila processada e dados da nuvem atualizados.', 'Sincronização Concluída');
      window.dispatchEvent(new CustomEvent('offline_cache_hydrated'));
    } catch (error) {
      await customAlert('Erro ao atualizar os dados.', 'Erro de Sincronização');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleNavigatePerfil = () => {
    onClose();
    if (onNavigate) onNavigate('perfil');
  };


  const handleSuporteTecnico = async () => {
    // Substitua pelo número real de suporte com código do país (55) e DDD
    const numeroWhatsApp = "5548996525008"; 
    const mensagem = "Olá! Preciso de suporte com o aplicativo Fast Leituras.";
    const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensagem)}`;

    try {
      await Browser.open({ url });
    } catch (error) {
      // Fallback para web caso o Capacitor falhe
      window.open(url, '_blank');
    }
  };

  const handleAvaliarApp = async () => {
    // TODO: Substituir pelo link da Play Store após o lançamento
    await customAlert('A avaliação estará disponível assim que o app for lançado na Play Store.', 'Em Breve! 🌟');
  };

  // Mapeamento das opções do menu movido para dentro do componente
  // para ter acesso às funções de state (setCameraModalOpen, setFeedbackModalOpen)
  const MENU_GROUPS = [
    {
      title: 'Conta',
      items: [
        { id: 'perfil', label: 'Meu Perfil e Conta', icon: User, onClick: handleNavigatePerfil },
        { id: 'camera', label: 'Configurações da Câmera', icon: Camera, onClick: () => setCameraModalOpen(true) },
      ]
    },
    {
      title: 'Sistema',
      items: [
        { id: 'sync', label: 'Sincronização e Status', icon: RefreshCw, onClick: () => setShowSyncModal(true) },
        { id: 'privacy', label: 'Política de Privacidade e Termos', icon: ShieldCheck, onClick: () => setShowPrivacyModal(true) },
      ]
    },
    {
      title: 'Suporte',
      items: [
        { id: 'support', label: 'Suporte Técnico', icon: Headset, onClick: handleSuporteTecnico },
        { id: 'rating', label: 'Avaliar o App', icon: Star, onClick: handleAvaliarApp },
        { id: 'feedback', label: 'Enviar Feedback', icon: MessageSquare, onClick: () => setFeedbackModalOpen(true) },
      ]
    }
  ];

  if (!isOpen) return null;

  const handleLogout = async () => {
    if (!await customConfirm('Deseja realmente sair da sua conta?')) return;
    
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
            {MENU_GROUPS.map((group, groupIndex) => (
              <div key={group.title} className="side-menu-group" style={{ marginTop: groupIndex > 0 ? '24px' : '0' }}>
                <div className="side-menu-section-title">{group.title}</div>
                <ul className="side-menu-list">
                  {group.items.map((item) => {
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
            ))}
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
            <p className="side-menu-version">Versão 1.0.2 • Fast Leituras</p>
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

      {showSyncModal && (
        <div className="side-menu-overlay" style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSyncModal(false)}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '360px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', height: 'auto', maxHeight: '90vh', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setShowSyncModal(false)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none' }}>
              <X size={20} color="#64748b" />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '8px', color: '#0ea5e9' }}><Cloud size={19} /></div>
              <div>
                <h2 style={{ fontSize: '1.1rem', margin: 0, color: '#0f172a' }}>Sincronização e sistema</h2>
                <p style={{ fontSize: '0.85rem', margin: 0, color: '#64748b' }}>Veja o estado da sua conexão e dos dados.</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#0f172a', marginBottom: '20px', fontWeight: '500' }}>
              <span style={{ width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%', display: 'inline-block' }} /> 
              Banco Supabase Sincronizado
            </div>
            <button 
              type="button" 
              onClick={handleForceSync} 
              disabled={isSyncing}
              style={{ width: '100%', padding: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
            >
              <RefreshCw className={isSyncing ? 'perfil-spin' : ''} size={17} />
              {isSyncing ? 'Atualizando...' : 'Forçar Sincronização'}
            </button>
          </div>
        </div>
      )}

      {showPrivacyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowPrivacyModal(false)}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '400px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>{tituloLegal}</h3>
              <button onClick={() => setShowPrivacyModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#64748b', cursor: 'pointer', padding: 0 }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', overflowY: 'auto', fontSize: '14px', color: '#475569', lineHeight: '1.6', textAlign: 'left' }}>
              {privacyAndTermsContent.map((section, index) => (
                <div key={index}>
                  <h4 style={{ color: '#0f172a', marginBottom: '8px' }}>{section.titulo}</h4>
                  {section.paragrafos.map((paragrafo, pIndex) => (
                    <p key={pIndex} style={{ marginBottom: '16px' }}>{paragrafo}</p>
                  ))}
                </div>
              ))}
              
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '24px', textAlign: 'center' }}>Última atualização: {ultimaAtualizacao}</p>
            </div>
            
            <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setShowPrivacyModal(false)} style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>
                Entendi e Concordo
              </button>
            </div>
            
          </div>
        </div>
      )}
    </>
  );
};

export default SideMenu;
