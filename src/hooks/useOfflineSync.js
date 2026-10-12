import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, criarClienteParaToken } from '../services/supabase';
import { Network } from '@capacitor/network';
import { temConexaoInternetUtil } from '../services/networkQualityService';
import { alternarStatusLeitura } from '../services/condominioService';
import { enfileirarNovoCondominio, sincronizarCondominiosOffline } from '../services/syncOfflineService';
import { getCurrentMonthKey } from '../utils/mesLeituras';
import {
  lerFilaPersistida, donoDoItem, periodoDoItem, removerItemConfirmado,
  capturarContextoSync, exigirContaOffline, resumirPendenciasOffline,
} from '../services/offlineQueueStorage';

const STORAGE_KEY = 'leituras_pendentes';
const PENDENCIAS_OFFLINE_KEY = 'pendencias_offline';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [resumo, setResumo] = useState({ quantidade: 0, precisaRevisao: false });
  const syncStatusRunning = useRef(false);
  const syncCadastroRunning = useRef(false);

  const carregarFilaLocal = useCallback(() => {
    try {
      const atual = resumirPendenciasOffline();
      setResumo(atual);
      return atual;
    } catch (error) {
      console.warn('Fila offline preservada para recuperação:', error);
      setResumo({ quantidade: 0, precisaRevisao: true });
      return null;
    }
  }, []);

  const salvarLeituraOffline = useCallback((dadosCondominio) => {
    try {
      const owner = exigirContaOffline();
      // Cadastro usa o serviço oficial, nunca um DTO de condomínio em leituras.
      enfileirarNovoCondominio({
        ...dadosCondominio, id: crypto.randomUUID(),
        user_id: owner, _offline_user_id: owner,
        mes_referencia: getCurrentMonthKey(), data: new Date().toISOString(),
      });
      carregarFilaLocal();
      return true;
    } catch (error) {
      return false;
    }
  }, [carregarFilaLocal]);

  const sincronizarPendenciasOffline = useCallback(async () => {
    if (syncStatusRunning.current) return;
    syncStatusRunning.current = true;
    try {
      if (!supabase || !(await temConexaoInternetUtil())) return;
      const contexto = await capturarContextoSync(supabase.auth, criarClienteParaToken);
      if (!contexto) return;
      for (const item of lerFilaPersistida(PENDENCIAS_OFFLINE_KEY)) {
        try {
          contexto.assertActive();
          if (donoDoItem(item) !== contexto.userId || !periodoDoItem(item)) continue;
          if (!item.id || !item.mes_referencia || typeof item.completo !== 'boolean') continue;
          await alternarStatusLeitura(item.id, item.mes_referencia, !item.completo, contexto);
          contexto.assertActive();
          removerItemConfirmado(PENDENCIAS_OFFLINE_KEY, item);
        } catch (error) {
          console.warn('Marcação offline continua pendente:', error);
        }
      }
    } catch (error) {
      console.warn('Não foi possível sincronizar marcações offline:', error);
    } finally {
      syncStatusRunning.current = false;
    }
  }, []);

  const sincronizarFilaPendente = useCallback(async () => {
    if (syncCadastroRunning.current) return;
    syncCadastroRunning.current = true;
    try {
      if (!supabase || !(await temConexaoInternetUtil())) return;
      await sincronizarCondominiosOffline();
      // A fila antiga misturava DTOs incompatíveis e não registrava dono.
      // Mantê-la intacta; recuperação exige conferir contrato/proprietário por item.
      if (lerFilaPersistida(STORAGE_KEY).length) {
        console.warn('Cadastros da fila antiga preservados para recuperação, sem envio automático.');
      }
      carregarFilaLocal();
    } catch (error) {
      console.warn('Cadastros offline continuam preservados:', error);
    } finally {
      syncCadastroRunning.current = false;
    }
  }, [carregarFilaLocal]);

  useEffect(() => {
    carregarFilaLocal();
    window.addEventListener('offline_queue_updated', carregarFilaLocal);
    let listenerHandle = null;
    let active = true;
    const tentarSincronizar = async () => {
      const redeUtil = await temConexaoInternetUtil();
      if (!active) return;
      setIsOnline(redeUtil);
      if (!redeUtil) return;
      await Promise.all([sincronizarPendenciasOffline(), sincronizarFilaPendente()]);
    };
    const setupListener = async () => {
      await tentarSincronizar();
      if (!active) return;
      const handle = await Network.addListener('networkStatusChange', status => {
        if (!active) return;
        if (!status.connected) setIsOnline(false);
        else tentarSincronizar().catch(() => {});
      });
      if (active) listenerHandle = handle;
      else handle.remove();
    };
    setupListener().catch(error => console.warn('Observador offline indisponível:', error));
    return () => {
      active = false;
      listenerHandle?.remove();
      window.removeEventListener('offline_queue_updated', carregarFilaLocal);
    };
  }, [carregarFilaLocal, sincronizarFilaPendente, sincronizarPendenciasOffline]);

  return { isOnline, pendentesCount: resumo.quantidade, revisaoOffline: resumo.precisaRevisao, salvarLeituraOffline, sincronizarFilaPendente, sincronizarPendenciasOffline };
}
