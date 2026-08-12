import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { Network } from '@capacitor/network';

const STORAGE_KEY = 'leituras_pendentes';
const PENDENCIAS_OFFLINE_KEY = 'pendencias_offline';

// ... (keep helper functions unchanged)

const readPendingQueue = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Não foi possível ler a fila de leituras pendentes:', error);
    return [];
  }
};

const writePendingQueue = (items) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch (error) {
    console.warn('Não foi possível salvar a fila de leituras pendentes:', error);
    return false;
  }
};

const readPendenciasOffline = () => {
  try {
    const raw = localStorage.getItem(PENDENCIAS_OFFLINE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Não foi possível ler pendências offline:', error);
    return [];
  }
};

const writePendenciasOffline = (items) => {
  try {
    localStorage.setItem(PENDENCIAS_OFFLINE_KEY, JSON.stringify(items));
    return true;
  } catch (error) {
    console.warn('Não foi possível salvar pendências offline:', error);
    return false;
  }
};

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendentes, setPendentes] = useState([]);

  const carregarFilaLocal = useCallback(() => {
    const fila = readPendingQueue();
    setPendentes(fila);
    return fila;
  }, []);

  const salvarLeituraOffline = useCallback((dadosLeitura) => {
    const filaAtual = readPendingQueue();
    const novoItem = {
      ...dadosLeitura,
      tempId: Date.now(),
      timestamp: new Date().toISOString(),
    };

    const novaFila = [...filaAtual, novoItem];
    const salvou = writePendingQueue(novaFila);

    if (salvou) {
      setPendentes(novaFila);
    }

    return salvou;
  }, []);

  const sincronizarPendenciasOffline = useCallback(async () => {
    if (!isOnline || !supabase) {
      return;
    }

    const pendencias = readPendenciasOffline();
    if (!Array.isArray(pendencias) || pendencias.length === 0) {
      return;
    }

    console.log('Reconectado! Sincronizando pendências offline com o Supabase...');

    const pendenciasRestantes = [];

    for (const item of pendencias) {
      try {
        const payload = {};

        if (item.status !== undefined) {
          payload.status = item.status;
        }

        if (typeof item.completo === 'boolean') {
          payload.concluido = item.completo;
        }

        if (typeof item.concluido === 'boolean') {
          payload.concluido = item.concluido;
        }

        if (Object.keys(payload).length === 0) {
          continue;
        }

        const { error } = await supabase
          .from('leituras')
          .update(payload)
          .eq('id', item.id);

        if (error) {
          throw error;
        }
      } catch (err) {
        console.error('Falha ao sincronizar item pendente:', item.id, err);
        pendenciasRestantes.push(item);
      }
    }

    writePendenciasOffline(pendenciasRestantes);
  }, [isOnline]);

  const sincronizarFilaPendente = useCallback(async () => {
    if (!isOnline || !supabase) {
      return;
    }

    const fila = readPendingQueue();
    if (!Array.isArray(fila) || fila.length === 0) {
      setPendentes([]);
      return;
    }

    const naoEnviados = [];

    for (const item of fila) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const { tempId, ...dadosParaEnvio } = item;
        const { error } = await supabase
          .from('leituras')
          .insert([dadosParaEnvio])
          .abortSignal(controller.signal);

        clearTimeout(timeoutId);

        if (error) {
          throw error;
        }
      } catch (err) {
        console.warn('Falha ao sincronizar item pendente:', item, err);
        naoEnviados.push(item);
      }
    }

    writePendingQueue(naoEnviados);
    setPendentes(naoEnviados);
  }, [isOnline]);

  useEffect(() => {
    carregarFilaLocal();

    const checkInitialStatus = async () => {
      const status = await Network.getStatus();
      setIsOnline(status.connected);
      if (status.connected) {
        sincronizarPendenciasOffline();
        sincronizarFilaPendente();
      }
    };

    checkInitialStatus();

    const listener = Network.addListener('networkStatusChange', (status) => {
      setIsOnline(status.connected);
      if (status.connected) {
        sincronizarPendenciasOffline();
        sincronizarFilaPendente();
      }
    });

    return () => {
      listener.remove();
    };
  }, [carregarFilaLocal, sincronizarFilaPendente, sincronizarPendenciasOffline]);

  return {
    isOnline,
    pendentesCount: pendentes.length,
    salvarLeituraOffline,
    sincronizarFilaPendente,
    sincronizarPendenciasOffline,
  };
}
