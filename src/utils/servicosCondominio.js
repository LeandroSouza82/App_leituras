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

export const NOMES_SERVICO = { agua: 'Água', gas: 'Gás', energia: 'Energia' };

const tiposPorServicos = {
  agua: 'Somente Água',
  gas: 'Somente Gás',
  energia: 'Energia Elétrica',
  'agua,gas': 'Água e Gás',
  'agua,energia': 'Água e Energia',
  'gas,energia': 'Gás e Energia',
  'agua,gas,energia': 'Água, Gás e Energia',
};

export const adicionarServicoCondominio = (condominio, servico) => {
  const ativos = new Set([...obterServicosAtivos(condominio), servico.toLowerCase()]);
  return tiposPorServicos[['agua', 'gas', 'energia'].filter(tipo => ativos.has(tipo)).join(',')];
};
