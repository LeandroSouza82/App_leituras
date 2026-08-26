import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import './index.css';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { initGoogleAuth } from './services/googleAuthService';

// Registra os elementos de PWA do Ionic (necessário para a câmera no navegador/WebView)
defineCustomElements(window);

// Inicializa o plugin nativo de Google Sign-In (no browser é um no-op silencioso)
initGoogleAuth();

// Proteção cirúrgica contra reloads automáticos ao reconectar à internet ou atualizar Service Worker
if (typeof window !== 'undefined') {
  // Intercepta e previne reloads disparados no evento de reconexão de rede (online)
  window.addEventListener('online', (event) => {
    event.stopImmediatePropagation?.();
  }, true);

  // Se houver Service Worker ativo, previne recarregamentos automáticos no controllerchange
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', (event) => {
      event.stopImmediatePropagation?.();
    }, true);
  }
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={googleClientId}>
        <App />
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
