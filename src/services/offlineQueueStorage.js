import { getCurrentMonthKey } from '../utils/mesLeituras.js';

export const OFFLINE_OWNER_KEY = 'fastleituras_offline_owner_v1';
export const OFFLINE_QUEUE_KEYS = [
  'fila_sync_auto', 'fila_sync_leituras_anteriores', 'fila_sync_condominios',
  'leituras_pendentes', 'pendencias_offline',
];
let contaAtiva = null;

// Uma fila ilegível não é uma fila vazia: nunca sobrescrever o registro antigo.
export const lerFilaPersistida = (key, storage = localStorage) => {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) throw new Error(`A fila ${key} precisa de recuperação. Os dados foram preservados.`);
  return items;
};

export const gravarFilaPersistida = (key, items, storage = localStorage) => {
  if (!Array.isArray(items)) throw new Error('Formato de fila inválido.');
  const raw = JSON.stringify(items);
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error('A gravação da fila não foi confirmada.');
  if (typeof window !== 'undefined' && storage === globalThis.localStorage) {
    try { window.dispatchEvent(new CustomEvent('offline_queue_updated')); } catch { /* Persistência já confirmada. */ }
  }
  return true;
};

export const donoDoItem = (item) => {
  const ids = [item?._offline_user_id, item?.leiturista_id, item?.user_id].filter(Boolean).map(String);
  return ids.length && ids.every(id => id === ids[0]) ? ids[0] : null;
};

export const periodoDoItem = (item) => {
  const explicit = item?.mes_referencia ?? item?.mesReferencia;
  if (explicit !== undefined && explicit !== null) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(explicit)) ? String(explicit) : null;
  }
  const raw = item?.data_leitura ?? item?.data ?? item?.timestamp;
  if (raw === undefined || raw === null || raw === '') return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : getCurrentMonthKey(date);
};

export const identidadeLeitura = (item) => {
  const owner = donoDoItem(item);
  const periodo = periodoDoItem(item);
  if (!owner || !periodo || !item.condominio_id || !item.unidade_id || !item.servico) return null;
  return JSON.stringify([owner, String(item.condominio_id), String(item.unidade_id).trim(), String(item.servico).toUpperCase(), periodo]);
};

export const enfileirarLeituraPersistida = (item, storage = localStorage) => {
  const identidade = identidadeLeitura(item);
  if (!identidade) throw new Error('Conta, condomínio, unidade, serviço e mês são obrigatórios para enfileirar.');
  const fila = lerFilaPersistida('fila_sync_auto', storage);
  if (item.db_id && fila.some(f => f.db_id === item.db_id && identidadeLeitura(f) !== identidade)) {
    throw new Error('O identificador da leitura já está associado a outra conta ou período.');
  }
  const index = fila.findIndex(f => identidadeLeitura(f) === identidade);
  if (index < 0) fila.push(item);
  else fila[index] = item;
  return gravarFilaPersistida('fila_sync_auto', fila, storage);
};

export const obterIdentificadorLeitura = (contexto, fila, ids, gerarUuid) => {
  const key = identidadeLeitura(contexto);
  if (!key || !ids || typeof ids !== 'object' || Array.isArray(ids)) throw new Error('Identidade da leitura ou mapa de IDs inválido.');
  if (ids[key]) return { key, id: ids[key] };
  const pendente = fila.find(f => identidadeLeitura(f) === key && f.db_id);
  if (pendente) return { key, id: pendente.db_id };
  const [ano, mes] = periodoDoItem(contexto).split('-');
  const prefix = `${contexto.condominio_id}|${contexto.unidade_id}|${String(contexto.servico).toUpperCase()}|${ano}|`;
  if (ids[prefix + Number(mes)] || ids[prefix + mes]) {
    throw new Error('Esta leitura possui um identificador antigo sem conta confirmada. Confira o envio existente antes de criar outro. As fotos foram preservadas.');
  }
  return { key, id: gerarUuid() };
};

// Remover somente a revisão efetivamente enviada, preservando edições/entradas concorrentes.
export const removerItemConfirmado = (key, item, storage = localStorage) => {
  const original = JSON.stringify(item);
  return gravarFilaPersistida(key, lerFilaPersistida(key, storage).filter(f => JSON.stringify(f) !== original), storage);
};

export const atualizarItemPersistido = (key, item, patch, storage = localStorage) => {
  const original = JSON.stringify(item);
  const fila = lerFilaPersistida(key, storage);
  const index = fila.findIndex(f => JSON.stringify(f) === original);
  if (index < 0) throw new Error('A pendência foi alterada durante a sincronização. Será conferida no próximo ciclo.');
  const updated = { ...item, ...patch };
  fila[index] = updated;
  gravarFilaPersistida(key, fila, storage);
  Object.assign(item, updated);
};

const temDadosOffline = (storage) => {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (OFFLINE_QUEUE_KEYS.includes(key)) {
      // JSON corrompido também precisa ser preservado/reconciliado.
      if ((storage.getItem(key) || '').trim() !== '[]') return true;
    } else if (/^(condominios_cache|leituras_db_ids|foto_|valor_|concluido_|unidades_|leituras_anteriores_)/.test(key || '')) {
      return true;
    }
  }
  return false;
};

export const prepararContaOffline = (userId, storage = localStorage) => {
  contaAtiva = null;
  if (!userId) throw new Error('Entre na sua conta para acessar os dados offline.');
  const owner = storage.getItem(OFFLINE_OWNER_KEY);
  if (owner && owner !== userId && temDadosOffline(storage)) {
    throw new Error('Há dados offline preservados de outra conta neste aparelho. Entre na conta que os salvou. A troca de conta exige a reconciliação desses dados.');
  }
  storage.setItem(OFFLINE_OWNER_KEY, userId);
  if (storage.getItem(OFFLINE_OWNER_KEY) !== userId) throw new Error('Não foi possível proteger a conta dos dados offline.');
  contaAtiva = userId;
  return userId;
};

export const encerrarContaOffline = () => { contaAtiva = null; };
export const contaOfflineAtiva = (storage = localStorage) =>
  contaAtiva && storage.getItem(OFFLINE_OWNER_KEY) === contaAtiva ? contaAtiva : null;

export const resumirPendenciasOffline = (storage = localStorage) => {
  let quantidade = 0;
  let precisaRevisao = false;
  const owner = contaOfflineAtiva(storage);
  for (const key of OFFLINE_QUEUE_KEYS) {
    try {
      const items = lerFilaPersistida(key, storage);
      quantidade += items.length;
      if (items.some(item => key === 'leituras_pendentes' || !owner
        || donoDoItem(item) !== owner || !periodoDoItem(item)
        || (key === 'fila_sync_auto' && (!item.db_id || !item.data_leitura
          || periodoDoItem({ data_leitura: item.data_leitura }) !== periodoDoItem(item)))
        || (key !== 'fila_sync_auto' && !item.mes_referencia))) precisaRevisao = true;
    } catch { precisaRevisao = true; } // Não inventar contagem para JSON ilegível.
  }
  return { quantidade, precisaRevisao };
};

export const exigirContaOffline = (userId = contaOfflineAtiva(), storage = localStorage) => {
  if (!userId || contaOfflineAtiva(storage) !== userId) throw new Error('A conta mudou ou foi desconectada. A pendência permanece no aparelho.');
  return userId;
};

// getSession permite captura offline; getUser(token) verifica a identidade antes de enviar.
// O cliente de envio usa o token capturado, sem acompanhar a troca de sessão global.
export const capturarContextoSync = async (auth, criarCliente, storage = localStorage) => {
  const { data, error } = await auth.getSession();
  if (error || !data?.session?.access_token) return null;
  const session = data.session;
  const owner = session.user?.id;
  if (contaOfflineAtiva(storage) !== owner) return null;
  const token = session.access_token;
  const { data: verified, error: userError } = await auth.getUser(token);
  if (userError || verified?.user?.id !== owner || contaOfflineAtiva(storage) !== owner) return null;
  const assertActive = () => exigirContaOffline(owner, storage);
  return { userId: owner, assertActive, client: criarCliente(token, assertActive) };
};
