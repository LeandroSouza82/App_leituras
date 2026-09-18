const normalizarTipoLeitura = (leituraOuTipo) => {
  const tipo = typeof leituraOuTipo === 'string'
    ? leituraOuTipo
    : leituraOuTipo?.tipoLeitura || leituraOuTipo?.tipo_leitura || '';

  return String(tipo)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

/**
 * Fonte canônica dos serviços habilitados pela configuração do condomínio.
 * Cadastros legados sem tipo definido mantêm o padrão Água e Gás.
 */
export const obterServicosAtivos = (leituraOuTipo) => {
  const tipo = normalizarTipoLeitura(leituraOuTipo);
  const servicos = [];

  if (tipo.includes('agua') || tipo === '') servicos.push('agua');
  if (tipo.includes('gas') || tipo === '') servicos.push('gas');
  if (tipo.includes('energia')) servicos.push('energia');

  return servicos;
};
