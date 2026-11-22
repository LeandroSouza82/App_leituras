import { supabase, criarClienteParaToken } from './supabase';
import { exigirContaOffline } from './offlineQueueStorage';
import { temConexaoInternetUtil } from './networkQualityService';
import { lerEnvios, gravarEnvios } from './ucondoTransferModel';
import { processarEnviosUcondo } from './ucondoTransferService';


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

const respostaEnvioConcluido = (erro) => erro?.code === '22023' && erro.message === 'Este envio já foi concluído'
  ? { modo: 'concluido', mensagem: erro.message } : null;

export const continuarEnvioUcondo = async ({ userId, card }) => {
  exigirContaOffline(userId);
  if (card?.completo) return { modo: 'concluido', mensagem: 'Este envio já foi concluído' };
  if (card?.bloqueiaRetomada) throw new Error('Este envio exige conferência no AutoFast antes de continuar.');
  if (!card?.id || !card.remoto || !card.podeContinuar) {
    throw new Error('Este envio não pode ser continuado agora.');
  }
  if (!(await temConexaoInternetUtil())) {
    throw new Error('Sem conexão com a internet para continuar o envio.');
  }
  const { client, assertActive } = await contextoAutenticado(userId);
  const { data, error } = await client.rpc('continuar_transferencia_ucondo', { p_transferencia_id: card.id });
  assertActive();
  const concluido = respostaEnvioConcluido(error);
  if (concluido) return concluido;
  if (error) throw new Error(error.message || 'Não foi possível continuar o envio.');
  return {
    mensagem: data === 'ja_na_fila' ? 'O envio já está na fila do robô.' : 'Envio recolocado na fila do robô.'
  };
};

/**
 * Retoma um envio para o uCondo que esteja em erro/falha.
 * - Pedido local com falha: limpa o erro local e dispara o reprocessamento sem duplicar.
 * - Pedido remoto: a retomada e a conferência final são transacionais no servidor.
 */
export const retomarEnvioUcondo = async ({ userId, card }) => {
  exigirContaOffline(userId);
  if (card?.completo) return { modo: 'concluido', mensagem: 'Este envio já foi concluído' };
  if (card?.bloqueiaRetomada) throw new Error('Este envio exige conferência no AutoFast antes de retomar.');
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

  const concluido = respostaEnvioConcluido(rpc.error);
  if (concluido) return concluido;
  if (rpc.error) throw new Error(rpc.error.message || 'Não foi possível retomar o envio.');
  return { modo: 'rpc', mensagem: 'Envio recolocado na fila. Os checkpoints concluídos foram preservados.' };
};
