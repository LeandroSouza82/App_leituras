import { supabase, criarClienteParaToken } from './supabase';
import { exigirContaOffline } from './offlineQueueStorage';
import { temConexaoInternetUtil } from './networkQualityService';
import { lerEnvios, gravarEnvios } from './ucondoTransferModel';
import { processarEnviosUcondo } from './ucondoTransferService';

const STATUS_TRABALHO_FALHA = ['erro', 'cancelada', 'concluida_com_pendencias'];
const STATUS_LOTE_FALHA = ['erro', 'cancelado'];
const STATUS_LOTE_ATIVO = ['pendente', 'em_andamento'];

const avisar = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('envios_ucondo_atualizados'));
  }
};

const contextoAutenticado = async (userId) => {
  const { data, error } = await supabase.auth.getSession();
  if (error || data?.session?.user?.id !== userId) {
    throw new Error('Entre novamente na sua conta.');
  }
  const assertActive = () => exigirContaOffline(userId);
  assertActive();
  return { client: criarClienteParaToken(data.session.access_token, assertActive), assertActive };
};

const rpcAusente = (error) => {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === 'PGRST202' || code === '42883' || msg.includes('could not find the function');
};

export const continuarEnvioUcondo = async ({ userId, card }) => {
  exigirContaOffline(userId);
  if (!card?.id || !card.remoto || !card.podeContinuar) {
    throw new Error('Este envio não pode ser continuado agora.');
  }
  if (!(await temConexaoInternetUtil())) {
    throw new Error('Sem conexão com a internet para continuar o envio.');
  }
  const { client, assertActive } = await contextoAutenticado(userId);
  const { data, error } = await client.rpc('continuar_transferencia_ucondo', { p_transferencia_id: card.id });
  assertActive();
  if (error) throw new Error(error.message || 'Não foi possível continuar o envio.');
  return {
    mensagem: data === 'ja_na_fila' ? 'O envio já está na fila do robô.' : 'Envio recolocado na fila do robô.'
  };
};

/**
 * Retoma um envio para o uCondo que esteja em erro/falha.
 * - Pedido local com falha: limpa o erro local e dispara o reprocessamento sem duplicar.
 * - Pedido remoto no Supabase: chama o RPC `retomar_transferencia_ucondo` (se disponível)
 *   ou recoloca apenas os trabalhos com falha em `aguardando` e o lote em `pendente`,
 *   preservando os checkpoints concluídos e sem criar trabalhos duplicados.
 */
export const retomarEnvioUcondo = async ({ userId, card }) => {
  exigirContaOffline(userId);
  if (!card?.id || !card?.falhou) {
    throw new Error('Este envio não está em estado de erro para retomada.');
  }

  // 1. Falha local (ainda na fila do aparelho, antes da confirmação do servidor)
  if (!card.remoto) {
    const fila = lerEnvios(userId);
    const existe = fila.some(p => p.id === card.id);
    if (!existe) throw new Error('Envio local não encontrado para retomada.');
    gravarEnvios(userId, fila.map(p => (p.id === card.id ? { ...p, erro: null } : p)));
    avisar();
    await processarEnviosUcondo(userId);
    return { modo: 'local', mensagem: 'Envio recolocado na fila de sincronização.' };
  }

  // 2. Falha remota no Supabase / robô AWS
  if (!(await temConexaoInternetUtil())) {
    throw new Error('Sem conexão com a internet para retomar o envio.');
  }

  const { client, assertActive } = await contextoAutenticado(userId);

  // Tenta primeiro o RPC transacional no Supabase
  const rpc = await client.rpc('retomar_transferencia_ucondo', {
    p_transferencia_id: card.id
  });
  assertActive();

  if (!rpc.error) {
    return {
      modo: 'rpc',
      mensagem: 'Envio recolocado na fila. Os checkpoints concluídos foram preservados.'
    };
  }

  if (!rpcAusente(rpc.error)) {
    throw new Error(rpc.error.message || 'Não foi possível retomar o envio.');
  }

  // Fallback seguro caso o RPC ainda não tenha sido aplicado no banco:
  // recoloca em 'aguardando' apenas os trabalhos com falha e reativa o lote existente.
  const trabalhosIds = Array.isArray(card.trabalhosIds) ? card.trabalhosIds.filter(Boolean) : [];
  if (!trabalhosIds.length) {
    throw new Error('Este envio falhou antes de entrar na fila do robô. Solicite um novo envio pelo condomínio.');
  }

  const lotesAtivos = await client
    .from('solicitacoes_lote')
    .select('id')
    .eq('user_id', userId)
    .in('status', STATUS_LOTE_ATIVO)
    .limit(1);
  assertActive();
  if (lotesAtivos.error) throw lotesAtivos.error;
  if (lotesAtivos.data?.length) {
    throw new Error('Já existe outro envio em andamento. Aguarde ele terminar para retomar.');
  }

  const trabalhos = await client
    .from('automacoes_fila')
    .select('id,status')
    .eq('user_id', userId)
    .in('id', trabalhosIds);
  assertActive();
  if (trabalhos.error) throw trabalhos.error;

  const falhosIds = (trabalhos.data || [])
    .filter(t => STATUS_TRABALHO_FALHA.includes(t.status))
    .map(t => t.id);

  if (falhosIds.length) {
    const updTrabalhos = await client
      .from('automacoes_fila')
      .update({ status: 'aguardando', erro_mensagem: null })
      .eq('user_id', userId)
      .in('id', falhosIds);
    assertActive();
    if (updTrabalhos.error) throw updTrabalhos.error;
  }

  if (card.solicitacaoId) {
    const updLote = await client
      .from('solicitacoes_lote')
      .update({ status: 'pendente', finalizado_em: null })
      .eq('id', card.solicitacaoId)
      .eq('user_id', userId)
      .in('status', STATUS_LOTE_FALHA);
    assertActive();
    if (updLote.error) throw updLote.error;
  }

  return {
    modo: 'fallback',
    mensagem: 'Envio recolocado na fila. Os checkpoints concluídos foram preservados.'
  };
};

