const STORAGE_PREFIX = 'leiturasapp';
const STORAGE_LAST_SESSION = 'ultima_sessao_mes';

const getStorageKey = (chaveMesAno) => `${STORAGE_PREFIX}:${chaveMesAno}`;

export const getLeituras = (chaveMesAno) => {
  const stored = localStorage.getItem(getStorageKey(chaveMesAno));

  if (!stored) {
    return [];
  }

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
};

export const saveLeituras = (chaveMesAno, leituras) => {
  localStorage.setItem(getStorageKey(chaveMesAno), JSON.stringify(leituras));
};

export const getLastSessionMonth = () => localStorage.getItem(STORAGE_LAST_SESSION);

export const setLastSessionMonth = (mesAno) => {
  localStorage.setItem(STORAGE_LAST_SESSION, mesAno);
};
