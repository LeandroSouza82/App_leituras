import { supabase } from './supabase';
import { Network } from '@capacitor/network';

/**
 * Restaura silenciosamente a gaveta local `leituras_anteriores_${condominioId}`
 * buscando dados do Supabase (tabela `unidades_leituras`).
 *
 * Só executa quando:
 *   - Há conexão de rede
 *   - A chave local ainda não existe (app recém-instalado ou localStorage limpo)
 *   - O usuário está autenticado (garante isolamento por RLS)
 *
 * @param {string|number} condominioId - ID do condomínio a restaurar
 * @returns {Promise<void>}
 */
export const sincronizarLeiturasNuvemParaLocal = async (condominioId) => {
  if (!condominioId || !supabase) return;

  const chaveLocal = `leituras_anteriores_${condominioId}`;

  // Sai imediatamente se a gaveta local já existe — sem custo de rede
  const gaveta = localStorage.getItem(chaveLocal);
  if (gaveta !== null) return;

  try {
    // Verifica conectividade antes de qualquer request
    const status = await Network.getStatus();
    if (!status.connected) return;

    // Confirma sessão ativa — respeita RLS do Supabase
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;

    // Busca as leituras anteriores do condomínio na nuvem.
    // A RLS da tabela `unidades_leituras` filtra automaticamente por usuário autenticado.
    // O campo `condominio_nome` armazena o condominio_id conforme ucondoImportService.
    const { data, error } = await supabase
      .from('unidades_leituras')
      .select('unidade, leitura_anterior')
      .eq('condominio_nome', condominioId);

    if (error || !data || data.length === 0) return;

    // Remonta o array no formato esperado pelo app: { unidade, leitura_anterior }
    const leiturasRemontadas = data
      .filter((row) => row.unidade && row.leitura_anterior !== null && row.leitura_anterior !== undefined)
      .map((row) => ({
        unidade: String(row.unidade).trim(),
        leitura_anterior: parseFloat(row.leitura_anterior),
      }));

    if (leiturasRemontadas.length === 0) return;

    // Reconstrói a gaveta local silenciosamente
    localStorage.setItem(chaveLocal, JSON.stringify(leiturasRemontadas));
  } catch {
    // Falha silenciosa — o app continua funcionando normalmente
  }
};

/**
 * Hidratação Global (Sync Down): Corrige o cache "sujo" dos dispositivos legados.
 * Busca as unidades completas (com as colunas leitura_anterior e leitura_anterior_gas)
 * e sobrepõe o cache local do app para água e gás.
 * É executado silenciosamente na inicialização da sessão.
 */
export const hidratarCacheLeiturasOffline = async () => {
  try {
    const status = await Network.getStatus();
    if (!status.connected) return; // Só hidrata online

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;

    // Busca todas as unidades vinculadas ao usuário logado, incluindo as colunas de leituras
    const { data: unidades, error } = await supabase
      .from('unidades')
      .select('condominio_id, unidade, leitura_anterior, leitura_anterior_gas');

    if (error || !unidades || unidades.length === 0) return;

    // Agrupa as unidades pelo condominio_id para reescrever as gavetas locais
    const mapPorCondominio = {};

    for (const u of unidades) {
      if (!u.condominio_id) continue;
      if (!mapPorCondominio[u.condominio_id]) {
        mapPorCondominio[u.condominio_id] = {};
      }

      const trimUnid = String(u.unidade).trim();
      if (!mapPorCondominio[u.condominio_id][trimUnid]) {
         mapPorCondominio[u.condominio_id][trimUnid] = { unidade: trimUnid };
      }

      if (u.leitura_anterior !== null && u.leitura_anterior !== undefined) {
         mapPorCondominio[u.condominio_id][trimUnid].leitura_anterior = parseFloat(u.leitura_anterior);
      }

      if (u.leitura_anterior_gas !== null && u.leitura_anterior_gas !== undefined) {
         mapPorCondominio[u.condominio_id][trimUnid].leitura_anterior_gas = parseFloat(u.leitura_anterior_gas);
      }
    }

    // Persiste (overwrite/merge) os dados limpos nas gavetas offline (chave unificada)
    let cacheAtualizado = false;
    for (const [condId, unidadesMap] of Object.entries(mapPorCondominio)) {
      const arrayFinal = Object.values(unidadesMap);
      if (arrayFinal.length > 0) {
        localStorage.setItem(`leituras_anteriores_${condId}`, JSON.stringify(arrayFinal));
        // Remove lixos antigos
        localStorage.removeItem(`leituras_anteriores_${condId}_AGUA`);
        localStorage.removeItem(`leituras_anteriores_${condId}_GAS`);
        cacheAtualizado = true;
      }
    }

    // Notifica a UI (React) que o cache local foi hidratado, forçando re-render
    if (cacheAtualizado) {
      window.dispatchEvent(new Event('offline_cache_hydrated'));
    }

  } catch (err) {
    console.warn('[Hydration] Erro ao tentar hidratar o cache de leituras:', err);
  }
};
