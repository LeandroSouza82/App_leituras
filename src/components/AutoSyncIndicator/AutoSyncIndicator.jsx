import React, { useState, useEffect } from 'react';
import { CloudUpload, RefreshCw } from 'lucide-react';
import './AutoSyncIndicator.css';

/**
 * AutoSyncIndicator - Feedback visual global discreto para a sincronização em background.
 * Fica invisível quando não há sincronização em andamento.
 */
const AutoSyncIndicator = () => {
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleSyncStatus = (event) => {
      if (event?.detail && typeof event.detail.syncing === 'boolean') {
        setIsSyncing(event.detail.syncing);
      }
    };

    window.addEventListener('syncStatus', handleSyncStatus);
    return () => {
      window.removeEventListener('syncStatus', handleSyncStatus);
    };
  }, []);

  if (!isSyncing) return null;

  return (
    <div className="auto-sync-indicator" role="status" aria-live="polite">
      <RefreshCw size={14} className="auto-sync-spinner" />
      <span className="auto-sync-text">Sincronizando...</span>
    </div>
  );
};

export default AutoSyncIndicator;
