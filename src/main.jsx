import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import './index.css';
import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Registra os elementos de PWA do Ionic (necessário para a câmera no navegador/WebView)
defineCustomElements(window);

// Proteção cirúrgica contra reloads automáticos ao reconectar à internet ou atualizar Service Worker
if (typeof window !== 'undefined') {
  // Intercepta e previne reloads disparados no evento de reconexão de rede (online)
  window.addEventListener('online', (event) => {
    event.stopImmediatePropagation?.();
    console.log('[Network] Conexão restabelecida. Reload automático de janela bloqueado.');
  }, true);

  // Se houver Service Worker ativo, previne recarregamentos automáticos no controllerchange
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', (event) => {
      event.stopImmediatePropagation?.();
      console.log('[SW] Controller alterado. Automatic window reload bloqueado.');
    }, true);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
