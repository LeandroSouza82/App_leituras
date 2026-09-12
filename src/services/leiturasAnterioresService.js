import { supabase } from './supabase.js';
import { Network } from '@capacitor/network';
import { enfileirarLeiturasAnteriores, sincronizarLeiturasAnterioresOffline } from './syncOfflineService.js';
import { parseLeituraNumerica } from '../utils/leituraNumerica.js';

const PROPRIEDADE_POR_SERVICO = {
  AGUA: 'leitura_anterior',
  GAS: 'leitura_anterior_gas',
  ENERGIA: 'leitura_anterior_energia',
};

/**
 * Deduplica um array de leituras anteriores por unidade, preservando os dados mais recentes de cada unidade.
 * @param {Array} lista
 * @returns {Array}
 */
export const deduplicarGavetaAnteriores = (lista) => {
  if (!Array.isArray(lista) || lista.length === 0) return [];
  const map = new Map();
  for (const item of lista) {
    if (!item || !item.unidade) continue;
    const u = String(item.unidade).trim();
    if (!u) continue;
    const existing = map.get(u) || {};
    map.set(u, { ...existing, ...item, unidade: u });
  }
  return Array.from(map.values());
};

const matchUnidade = (a, b) => {
  const sa = String(a || '').trim().toLowerCase();
  const sb = String(b || '').trim().toLowerCase();
  if (sa === sb) return true;
  const na = sa.replace(/^(apartamento|apto|ap|a)[-\s]*/i, '');
  const nb = sb.replace(/^(apartamento|apto|ap|a)[-\s]*/i, '');
  return Boolean(na && nb && na === nb);
};

/**
 * Resolve a leitura anterior canônica de uma unidade para um serviço específico.
 * Utilizada de forma unificada na tela, validação ao salvar e exportação.
 *
 * @param {string|number} condominioId
 * @param {string} unidadeId
 * @param {'agua'|'gas'|'energia'|string} servico
 * @returns {number|null}
 */
export const obterLeituraAnterior = (condominioId, unidadeId, servico = 'AGUA') => {
  if (!condominioId || !unidadeId) return null;
  const condId = String(condominioId).trim();
  const uId = String(unidadeId).trim();
  const srv = String(servico || 'agua').toUpperCase();
  const propAlvo = PROPRIEDADE_POR_SERVICO[srv] || 'leitura_anterior';

  // 1. Gaveta unificada (leituras_anteriores_${condId}) - varre do final para o início (mais recente)
  const chaveUnificada = `leituras_anteriores_${condId}`;
  try {
    const raw = localStorage.getItem(chaveUnificada);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (let i = parsed.length - 1; i >= 0; i--) {
          const item = parsed[i];
          if (item && matchUnidade(item.unidade, uId)) {
            if (item[propAlvo] !== undefined && item[propAlvo] !== null) {
              const num = parseLeituraNumerica(item[propAlvo]);
              if (num !== null) return num;
            }
          }
        }
      }
    }
  } catch (_) {}

  // 2. Gaveta por serviço (leituras_anteriores_${condId}_${srv}) - varre do final para o início
  const chaveServico = `leituras_anteriores_${condId}_${srv}`;
  try {
    const rawServico = localStorage.getItem(chaveServico);
    if (rawServico) {
      const parsedServico = JSON.parse(rawServico);
      if (Array.isArray(parsedServico) && parsedServico.length > 0) {
        for (let i = parsedServico.length - 1; i >= 0; i--) {
          const item = parsedServico[i];
          if (item && matchUnidade(item.unidade, uId)) {
            if (item.leitura_anterior !== undefined && item.leitura_anterior !== null) {
              const num = parseLeituraNumerica(item.leitura_anterior);
              if (num !== null) return num;
            }
          }
        }
      }
    }
  } catch (_) {}

  return null;
};

/**
 * Retorna o mapa { [unidade]: number } com as leituras anteriores de todas as unidades
 * para o condomínio e serviço especificados.
 *
 * @param {string|number} condominioId
 * @param {'agua'|'gas'|'energia'|string} servico
 * @returns {Record<string, number>}
 */
export const obterMapaLeiturasAnteriores = (condominioId, servico = 'AGUA') => {
  if (!condominioId) return {};
  const condId = String(condominioId).trim();
  const srv = String(servico || 'agua').toUpperCase();
  const propAlvo = PROPRIEDADE_POR_SERVICO[srv] || 'leitura_anterior';
  const mapa = {};

  // 1. Lê gaveta unificada (itera em ordem; entradas posteriores sobrescrevem anteriores)
  const chaveUnificada = `leituras_anteriores_${condId}`;
  try {
    const raw = localStorage.getItem(chaveUnificada);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || !item.unidade) continue;
          const u = String(item.unidade).trim();
          if (item[propAlvo] !== undefined && item[propAlvo] !== null) {
            const num = parseLeituraNumerica(item[propAlvo]);
            if (num !== null) mapa[u] = num;
          }
        }
      }
    }
  } catch (_) {}

  // 2. Complementa com gaveta por serviço para unidades sem valor na unificada
  const chaveServico = `leituras_anteriores_${condId}_${srv}`;
  try {
    const rawServico = localStorage.getItem(chaveServico);
    if (rawServico) {
      const parsedServico = JSON.parse(rawServico);
      if (Array.isArray(parsedServico)) {
        for (const item of parsedServico) {
          if (!item || !item.unidade) continue;
          const u = String(item.unidade).trim();
          if (mapa[u] === undefined && item.leitura_anterior !== undefined && item.leitura_anterior !== null) {
            const num = parseLeituraNumerica(item.leitura_anterior);
            if (num !== null) mapa[u] = num;
          }
        }
      }
    }
  } catch (_) {}

  return mapa;
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

  const valorNumerico = parseLeituraNumerica(valorDigitado);
  if (valorNumerico === null) return { ok: false, unidadeLocal: null };

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
      lista = deduplicarGavetaAnteriores(Array.isArray(parsed) ? parsed : []);
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
  // Desativado: A coluna 'leitura_anterior' pertence exclusivamente à tabela 'unidades_leituras'.
  // A busca global não é mais necessária, pois o modal (LeituraFotoModal.jsx) 
  // agora busca dinamicamente sob demanda a última leitura inserida no histórico.
  return;
};
