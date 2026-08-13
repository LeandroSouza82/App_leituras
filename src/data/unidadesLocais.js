/**
 * unidadesLocais - Registro offline de condomínios e suas respectivas unidades/torres.
 */

// Função auxiliar para gerar unidades de 101 a 1110 (11 andares, 10 por andar)
const gerarUnidadesTorre = (prefixo) => {
  const unidades = [];
  for (let andar = 1; andar <= 11; andar++) {
    for (let apto = 1; apto <= 10; apto++) {
      const num = `${andar}${String(apto).padStart(2, '0')}`;
      unidades.push(`${prefixo}-${num}`);
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
  // Adicione outros condomínios aqui seguindo o mesmo padrão
};

export const getUnidadesOffline = (nomeCondominio) => {
  const condo = CONDOMINIOS_OFFLINE[nomeCondominio];
  return condo ? condo.unidades : null;
};
