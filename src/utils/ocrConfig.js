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
