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

/**
 * normalizarUnidadeuCondo - Garante que a unidade tenha 4 dígitos numéricos (ex: A-0101)
 */
export const normalizarUnidadeuCondo = (unidadeStr) => {
  if (!unidadeStr) return '';
  const partes = unidadeStr.split('-');
  if (partes.length !== 2) return unidadeStr;

  const prefixo = partes[0];
  let numero = partes[1];

  if (numero.length === 3) {
    numero = '0' + numero;
  }

  return `${prefixo}-${numero}`;
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
