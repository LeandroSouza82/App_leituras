// Pure state/confirmation rules. A click or an upload attempt is never success.
export const chaveEnvios = userId => `fastleituras_envios_ucondo_v1_${userId}`;
export const lerEnvios = (userId, storage = localStorage) => {
  const data = JSON.parse(storage.getItem(chaveEnvios(userId)) || '[]');
  if (!Array.isArray(data) || data.some(p => p.userId !== userId)) throw new Error('Os envios locais precisam de recuperação. Os dados foram preservados.');
  return data;
};
export const gravarEnvios = (userId, data, storage = localStorage) => {
  if (!Array.isArray(data) || data.some(p => p.userId !== userId)) throw new Error('Conta do envio inválida.');
  const json = JSON.stringify(data);
  storage.setItem(chaveEnvios(userId), json);
  if (storage.getItem(chaveEnvios(userId)) !== json) throw new Error('Não foi possível guardar o pedido de envio.');
};

const inteiro = value => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export const confirmarEtapasTrabalho = trabalho => {
  const total = inteiro(trabalho.total_unidades);
  const mensagem = String(trabalho.resultado_mensagem || '');
  const obter = padrao => {
    const match = mensagem.match(padrao);
    return match && Number(match[2]) === total && Number(match[1]) <= total ? Number(match[1]) : null;
  };
  let leituras = obter(/Leituras conferidas:\s*(\d+)\/(\d+) unidades/i);
  let semFoto = 0;
  let foraGrade = 0;
  let fotos = obter(/Fotos confirmadas:\s*(\d+)\/(\d+) unidades/i);
  const final = mensagem.match(/Fluxo completo concluído[^:]*:\s*(\d+) unidades com leituras conferidas\s*\((\d+) fotos confirmadas,\s*(\d+) marcadas sem foto\)/i);
  const dispensadas = mensagem.match(/Unidades sem medidor fora da grade:\s*(.+)\.\s*$/i);
  const nomesDispensados = dispensadas?.[1].split(',').map(nome => nome.trim()) || [];
  const totalForaGrade = nomesDispensados.length;
  if (final && nomesDispensados.every(Boolean) && new Set(nomesDispensados).size === totalForaGrade
    && Number(final[1]) + totalForaGrade === total
    && Number(final[2]) + Number(final[3]) === total
    && totalForaGrade <= Number(final[3])) {
    leituras = Number(final[1]);
    fotos = Number(final[2]);
    semFoto = Number(final[3]);
    foraGrade = totalForaGrade;
  }
  const completo = total > 0 && trabalho.status === 'concluida' && !trabalho.erros && !trabalho.pendencias
    && leituras !== null && fotos !== null && leituras + foraGrade === total && fotos + semFoto === total;
  return { leituras, fotos, semFoto, foraGrade, completo, total };
};

export const progressoTransferencia = (pedido, trabalhos, lote, agora = Date.now()) => {
  const esperados = pedido.total_leituras || pedido.manifesto?.length || 0;
  const ids = pedido.trabalhos_ids || [];
  const selecionados = ids.map(id => trabalhos.find(t => t.id === id && t.user_id === pedido.user_id)).filter(Boolean);
  const etapas = selecionados.map(confirmarEtapasTrabalho);
  const leituras = etapas.reduce((n,e) => n + (e.leituras || 0), 0);
  const fotos = etapas.reduce((n,e) => n + (e.fotos || 0), 0);
  const semFoto = etapas.reduce((n,e) => n + e.semFoto, 0);
  const foraGrade = etapas.reduce((n,e) => n + e.foraGrade, 0);
  const servicosConfirmados = new Set(selecionados.filter((_, i) => etapas[i].completo).map(t => t.servico));
  const servicosPendentes = (pedido.servicos || []).filter(servico => !servicosConfirmados.has(servico));
  // A retomada pode concluir o trabalho original sem mudar o estado do lote antigo.
  const loteFinalizado = lote?.status === 'concluido'
    || (pedido.status === 'despachada' && ['erro', 'cancelado'].includes(lote?.status));
  const completo = esperados > 0 && pedido.status !== 'erro' && loteFinalizado
    && ids.length === pedido.servicos?.length && new Set(ids).size === ids.length && selecionados.length === ids.length
    && etapas.every(e => e.completo) && leituras + foraGrade === esperados && fotos + semFoto === esperados;
  const falhou = !completo && (pedido.status === 'erro' || ['erro','cancelado'].includes(lote?.status)
    || selecionados.some(t => ['erro','cancelada','concluida_com_pendencias'].includes(t.status)));
  const ativo = selecionados.find(t => t.status === 'em_andamento');
  const aguardaDecisao = ativo && /aguardando[^.]*decis[aã]o|aguardando[^.]*substitui/i.test(ativo.resultado_mensagem || '');
  const semSinal = ativo && (!ativo.heartbeat_at || agora - new Date(ativo.heartbeat_at).getTime() > 90000);
  let etapa = completo ? 'Concluído no uCondo' : falhou ? 'Precisa de atenção'
    : pedido.status === 'aguardando' ? 'Na fila do servidor'
    : aguardaDecisao ? 'Aguardando conferência no AutoFast'
    : semSinal ? 'Sem atualização do robô'
    : ativo ? (etapas.some(e => e.leituras) ? 'Enviando e conferindo fotos' : 'Enviando e conferindo leituras')
    : 'Aguardando o robô';
  if (lote?.status === 'concluido' && !completo && !falhou) etapa = 'Conferir confirmação final';
  const percentual = completo ? 100 : esperados ? Math.min(99, Math.floor((leituras + foraGrade + fotos + semFoto) * 100 / (2 * esperados))) : 0;
  return { etapa, percentual, leituras, fotos, semFoto, foraGrade, servicosPendentes, total: esperados, completo, falhou,
    atualizadoEm: selecionados.map(t => t.heartbeat_at).filter(Boolean).sort().at(-1),
    detalhe: completo ? 'Leituras e fotos confirmadas no uCondo.' : falhou ? 'Confira as pendências no AutoFast antes de tentar novamente.'
      : semSinal ? 'As últimas contagens foram mantidas. O envio não foi declarado concluído.'
      : 'Você pode continuar fotografando e preenchendo o próximo condomínio.' };
};

// Os pedidos chegam em ordem decrescente de criação.
export const separarHistoricoTransferencias = cards => {
  const historico = [];
  const atuais = [];
  const concluidos = new Map();
  for (const card of cards) {
    const chave = JSON.stringify([card.condominioId, card.periodo]);
    const servicosConcluidos = concluidos.get(chave) || new Set();
    const pendentes = card.servicosPendentes ?? card.servicos;
    if (card.completo) {
      historico.push(card);
      for (const servico of card.servicos) servicosConcluidos.add(servico);
      concluidos.set(chave, servicosConcluidos);
    } else if (card.falhou && pendentes.length && pendentes.every(servico => servicosConcluidos.has(servico))) {
      historico.push({ ...card, tentativaAnterior: true });
    } else {
      atuais.push(card);
    }
  }
  return { historico, atuais };
};

export const contarSincronizadas = (itens, registros) => itens.filter(item => registros.some(row =>
  row.id === item.db_id && row.leiturista_id === item.leiturista_id && row.servico === item.servico
  && row.unidade_id === item.unidade_id && row.condominio_nome === item.condominio_nome
  && Math.round(Number(row.leitura_atual) * 10000) === Math.round(Number(item.leitura_atual) * 10000)
  && (Boolean(row.foto_url) || (item.sem_medidor === true && Number(row.leitura_atual) === 0)))).length;
