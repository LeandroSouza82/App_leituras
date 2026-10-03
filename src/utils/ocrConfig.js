/**
 * ocrConfig.js — Configuração do OCR offline (etapa 1)
 *
 * Persiste a preferência do usuário via localStorage, sem interferir
 * em nenhum outro dado do aplicativo.
 *
 * Chave isolada para não colidir com leituras, fotos ou concluídos.
 */

const STORAGE_KEY = 'ocr_offline_ativo';
const listeners = new Set();

export const observarOcr = (listener) => {
  listeners.add(listener);
  globalThis.window?.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    globalThis.window?.removeEventListener('storage', listener);
  };
};

/**
 * Retorna true se o OCR offline estiver ativado pelo usuário.
 * Padrão: desativado (false).
 */
export const isOcrAtivo = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * Persiste a preferência do usuário.
 * @param {boolean} ativo
 */
export const setOcrAtivo = (ativo) => {
  try {
    localStorage.setItem(STORAGE_KEY, ativo ? 'true' : 'false');
    for (const listener of listeners) listener();
    return true;
  } catch {
    return false;
  }
};

// Descreve as casas físicas do visor, não a máscara numérica do aplicativo.
export const normalizarPadraoVisor = (padrao) => {
  if (!Number.isInteger(padrao?.inteiros) || padrao.inteiros < 1 || padrao.inteiros > 6 ||
      !Number.isInteger(padrao?.decimais) || padrao.decimais < 0 || padrao.decimais > 4) return null;
  return Object.freeze({ inteiros: padrao.inteiros, decimais: padrao.decimais });
};

const chavePadraoVisor = (condominioId, servico) => {
  const id = String(condominioId ?? '').trim();
  const tipo = String(servico ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return id && ['agua', 'gas', 'energia'].includes(tipo) ? `ocr_visor_${JSON.stringify([id, tipo])}` : null;
};

export const obterPadraoVisor = (condominioId, servico) => {
  try {
    const chave = chavePadraoVisor(condominioId, servico);
    return chave ? normalizarPadraoVisor(JSON.parse(localStorage.getItem(chave))) : null;
  } catch { return null; }
};

export const salvarPadraoVisor = (condominioId, servico, padrao) => {
  const chave = chavePadraoVisor(condominioId, servico);
  const valido = normalizarPadraoVisor(padrao);
  if (!chave || !valido) return false;
  try {
    localStorage.setItem(chave, JSON.stringify(valido));
    return true;
  } catch { return false; }
};
