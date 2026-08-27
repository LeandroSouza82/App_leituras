import { supabase } from './supabase';
import { Network } from '@capacitor/network';
import { enfileirarLeiturasAnteriores, sincronizarLeiturasAnterioresOffline } from './syncOfflineService';

const PROPRIEDADE_POR_SERVICO = {
  AGUA: 'leitura_anterior',
  GAS: 'leitura_anterior_gas',
  ENERGIA: 'leitura_anterior_energia',
};

/**
 * Rotaciona organicamente a leitura anterior no cache local após salvar uma leitura.
 * O valor digitado passa a ser a nova leitura_anterior da aba correspondente.
 *
 * @param {string|number} condominioId
 * @param {string} unidadeId
 * @param {'agua'|'gas'|'energia'|string} tipoLeitura
 * @param {string|number} valorDigitado
 * @returns {{ ok: boolean, unidadeLocal: object|null }}
 */
export const rotacionarLeituraAnteriorLocal = (condominioId, unidadeId, tipoLeitura, valorDigitado) => {
  if (!condominioId || !unidadeId) return { ok: false, unidadeLocal: null };

  const valorNumerico = parseFloat(String(valorDigitado).replace(',', '.'));
  if (isNaN(valorNumerico)) return { ok: false, unidadeLocal: null };

  const servico = String(tipoLeitura || 'agua').toUpperCase();
  const propAlvo = PROPRIEDADE_POR_SERVICO[servico] || 'leitura_anterior';
  const unidadeTrim = String(unidadeId).trim();
  const condId = String(condominioId);
  let unidadeLocal = null;

  // Gaveta unificada: { unidade, leitura_anterior, leitura_anterior_gas, leitura_anterior_energia }
  const chaveUnificada = `leituras_anteriores_${condId}`;
  try {
    let lista = [];
    const raw = localStorage.getItem(chaveUnificada);
    if (raw) {
      const parsed = JSON.parse(raw);
      lista = Array.isArray(parsed) ? parsed : [];
    }

    const idx = lista.findIndex((l) => String(l.unidade).trim() === unidadeTrim);
    if (idx !== -1) {
      unidadeLocal = { ...lista[idx], [propAlvo]: valorNumerico };
      lista[idx] = unidadeLocal;
    } else {
      unidadeLocal = { unidade: unidadeTrim, [propAlvo]: valorNumerico };
      lista.push(unidadeLocal);
    }
    localStorage.setItem(chaveUnificada, JSON.stringify(lista));
  } catch (err) {
    console.error('[rotacionarLeituraAnteriorLocal] Erro na gaveta unificada:', err);
    return { ok: false, unidadeLocal: null };
  }

  // Gaveta por serviço (compatibilidade com App.jsx e importação de planilhas)
  const chaveServico = `leituras_anteriores_${condId}_${servico}`;
  try {
    let listaServico = [];
    const rawServico = localStorage.getItem(chaveServico);
    if (rawServico) {
      const parsed = JSON.parse(rawServico);
      listaServico = Array.isArray(parsed) ? parsed : [];
    }

    const idxServico = listaServico.findIndex((l) => String(l.unidade).trim() === unidadeTrim);
    if (idxServico !== -1) {
      listaServico[idxServico] = { ...listaServico[idxServico], leitura_anterior: valorNumerico };
    } else {
      listaServico.push({ unidade: unidadeTrim, leitura_anterior: valorNumerico });
    }
    localStorage.setItem(chaveServico, JSON.stringify(listaServico));

    // Enfileira lote completo do serviço para sync com Supabase quando houver rede
    enfileirarLeiturasAnteriores(condId, listaServico, servico);
  } catch (err) {
    console.warn('[rotacionarLeituraAnteriorLocal] Erro na gaveta por serviço:', err);
  }

  window.dispatchEvent(new CustomEvent('offline_cache_hydrated', { detail: { condId } }));

  Network.getStatus()
    .then((status) => {
      if (status.connected) sincronizarLeiturasAnterioresOffline();
    })
    .catch(() => {});

  return { ok: true, unidadeLocal };
};

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
