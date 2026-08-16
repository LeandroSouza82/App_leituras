/**
 * unidadesLocais - Registro offline de condomínios e suas respectivas unidades/torres.
 */

// Função auxiliar para gerar unidades de 0101 a 1110 (Padronização 4 dígitos uCondo)
const gerarUnidadesTorre = (prefixo) => {
  const unidades = [];
  for (let andar = 1; andar <= 11; andar++) {
    for (let apto = 1; apto <= 10; apto++) {
      const andarStr = String(andar).padStart(2, '0');
      const aptoStr = String(apto).padStart(2, '0');
      unidades.push(`${prefixo}-${andarStr}${aptoStr}`);
    }
  }
  return unidades;
};

export const CONDOMINIOS_OFFLINE = {
  'Lindolfo dos Santos': {
    unidades: [
      ...gerarUnidadesTorre('A'),
      ...gerarUnidadesTorre('B')
    ]
  },
};

export const getUnidadesOffline = (nomeCondominio) => {
  const condo = CONDOMINIOS_OFFLINE[nomeCondominio];
  return condo ? condo.unidades : null;
};
