/**
 * unidadesLocais - Registro offline de condomínios e suas respectivas unidades/torres.
 */

export const CONDOMINIOS_OFFLINE = {
  // Condomínios cadastrados offline devem ter seus nomes originais estritos
};

export const getUnidadesOffline = (nomeCondominio) => {
  if (!nomeCondominio) return null;
  const condo = CONDOMINIOS_OFFLINE[nomeCondominio];
  return condo?.unidades && Array.isArray(condo.unidades) ? condo.unidades : null;
};

