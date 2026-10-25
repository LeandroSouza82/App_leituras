import { supabase, criarClienteParaToken } from './supabase';
import { salvarLeituraOffline, sincronizarFilaEmBackground, readFilaSync } from './syncService';
import { exigirContaOffline } from './offlineQueueStorage';
import { temConexaoInternetUtil } from './networkQualityService';
import { lerEnvios, gravarEnvios, contarSincronizadas } from './ucondoTransferModel';

const avisar = () => window.dispatchEvent(new CustomEvent('envios_ucondo_atualizados'));
let processando = false;

export const registrarEnvioUcondo = ({ userId, condominioId, nome, periodo, servicos, itens }) => {
  exigirContaOffline(userId);
  if (!condominioId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) || !itens.length || !servicos.length
    || servicos.some(s => !['AGUA','GAS'].includes(s))) throw new Error('Confira o condomínio, mês e serviços. O robô atual atende água e gás.');
  if (itens.some(i => i.leiturista_id !== userId || i.condominio_id !== condominioId || i.mes_referencia !== periodo
    || i.condominio_nome !== nome || !servicos.includes(i.servico) || !i.unidade_id
    || !i.photoPath || !i.db_id || !Number.isFinite(i.leitura_atual))) throw new Error('Todas as leituras e fotos deste condomínio e mês precisam estar salvas no aparelho.');
  const fila = lerEnvios(userId);
  const existente = fila.find(p => p.condominioId === condominioId && p.periodo === periodo && !p.serverId && !p.erro);
  if (existente) return existente;
  const pedido = { id: crypto.randomUUID(), userId, condominioId, nome, periodo, servicos, itens,
    preparadas: false, sincronizadas: 0, createdAt: new Date().toISOString() };
  gravarEnvios(userId, [...fila, pedido]);
  avisar();
  return pedido;
};

const contexto = async userId => {
  const { data, error } = await supabase.auth.getSession();
  if (error || data?.session?.user?.id !== userId) throw new Error('Entre novamente na sua conta.');
  const assertActive = () => exigirContaOffline(userId);
  assertActive();
  return { client: criarClienteParaToken(data.session.access_token, assertActive), assertActive };
};
const atualizar = (userId, id, patch) => {
  exigirContaOffline(userId);
  gravarEnvios(userId, lerEnvios(userId).map(p => p.id === id ? { ...p, ...patch } : p));
  avisar();
};

// Runs independently of the photo modal. Closing that screen never cancels a
// request accepted by AWS, nor clears the local pending photos.
export const processarEnviosUcondo = async userId => {
  if (processando) return;
  processando = true;
  try {
    if (!(await temConexaoInternetUtil())) return;
    const { client, assertActive } = await contexto(userId);
    for (const pedido of lerEnvios(userId).filter(p => !p.serverId && !p.erro)) {
      assertActive();
      if (!pedido.preparadas) {
        let preparadas = true;
        for (const item of pedido.itens) {
          assertActive();
          if (!(await salvarLeituraOffline(item, null, item.fileName))) { preparadas = false; break; }
        }
        if (!preparadas) {
          atualizar(userId, pedido.id, { erro: 'Não foi possível preparar as leituras deste condomínio. Elas permanecem guardadas no aparelho; confira o mês e tente novamente.' });
          continue;
        }
        atualizar(userId, pedido.id, { preparadas: true });
      }
      // The existing background uploader retains ownership and durable retries.
      void sincronizarFilaEmBackground().catch(() => {});
      const registros = [];
      for (let inicio = 0; inicio < pedido.itens.length; inicio += 100) {
        const { data, error } = await client.from('leituras_detalhes')
          .select('id,leiturista_id,unidade_id,servico,condominio_nome,leitura_atual,foto_url')
          .eq('leiturista_id', userId).in('id', pedido.itens.slice(inicio, inicio + 100).map(i => i.db_id));
        assertActive();
        if (error) throw error;
        registros.push(...(data || []));
      }
      // A previous photo URL is not proof that this capture finished uploading.
      // Only the uploader's confirmed removal of the exact pending item permits
      // the AWS request; edits/uploads in other condos have different IDs.
      const pendentes = new Set(readFilaSync().map(item => item.db_id));
      const sincronizadas = contarSincronizadas(pedido.itens, registros.filter(row => !pendentes.has(row.id)));
      atualizar(userId, pedido.id, { sincronizadas });
      if (sincronizadas !== pedido.itens.length) continue;
      const resposta = await client.rpc('solicitar_transferencia_ucondo', {
        p_condominio_id: pedido.condominioId, p_periodo: pedido.periodo,
        p_servicos: pedido.servicos, p_leituras_ids: pedido.itens.map(i => i.db_id),
      });
      assertActive();
      if (resposta.error) {
        if (['22023','42501'].includes(resposta.error.code)) {
          atualizar(userId, pedido.id, { erro: resposta.error.message });
          continue;
        }
        throw resposta.error;
      }
      const remoto = Array.isArray(resposta.data) ? resposta.data[0] : resposta.data;
      if (!remoto?.id) throw new Error('O servidor ainda não confirmou o recebimento.');
      atualizar(userId, pedido.id, { serverId: remoto.id, recebidaEm: new Date().toISOString() });
    }
  } finally { processando = false; }
};

export const consultarEnviosUcondo = async userId => {
  const { client, assertActive } = await contexto(userId);
  const pedidos = await client.from('transferencias_ucondo').select('id,user_id,condominio_id,condominio_nome,periodo,servicos,total_leituras,status,solicitacao_id,trabalhos_ids,mensagem,created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(40);
  if (pedidos.error) throw pedidos.error;
  const ids = [...new Set(pedidos.data.flatMap(p => p.trabalhos_ids || []))];
  const lotes = [...new Set(pedidos.data.map(p => p.solicitacao_id).filter(Boolean))];
  const [trabalhos, solicitacoes] = await Promise.all([
    ids.length ? client.from('automacoes_fila').select('id,user_id,status,total_unidades,erros,pendencias,heartbeat_at,resultado_mensagem').eq('user_id',userId).in('id',ids) : { data: [] },
    lotes.length ? client.from('solicitacoes_lote').select('id,status').eq('user_id',userId).in('id',lotes) : { data: [] },
  ]);
  assertActive();
  if (trabalhos.error || solicitacoes.error) throw trabalhos.error || solicitacoes.error;
  return { pedidos: pedidos.data, trabalhos: trabalhos.data, lotes: solicitacoes.data };
};
