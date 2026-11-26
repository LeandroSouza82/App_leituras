export function protegerValoresNoCache(condominios, userId) {
  return condominios.map(condominio => {
    if (!userId || !condominio.administradorId || condominio.administradorId === userId) return condominio;
    // Nas versões anteriores o cache podia conter o valor enviado pelo cadastro do gestor.
    return {
      ...condominio,
      compartilhado: true,
      valor: condominio.compartilhado === true ? condominio.valor ?? null : null,
    };
  });
}

export function lerValorIndividual(valor) {
  const texto = String(valor ?? '').replace(/\s/g, '').replace(/^R\$/, '');
  const padraoBR = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;
  const decimalComPonto = /^\d+\.\d{1,2}$/;
  if (!padraoBR.test(texto) && !decimalComPonto.test(texto)) return null;
  const numero = Number(padraoBR.test(texto) ? texto.replace(/\./g, '').replace(',', '.') : texto);
  return numero <= 9999999999.99 ? numero : null;
}
