import { supabase, criarClienteParaToken } from './supabase';
import { exigirContaOffline, capturarContextoSync } from './offlineQueueStorage';

const chave = id => `sem_medidor_${exigirContaOffline()}_${id}`;
export const lerUnidadesSemMedidor = id => {
  if (!id) return {};
  const raw = localStorage.getItem(chave(id));
  try {
    const mapa = JSON.parse(raw || '{}');
    if (!mapa || Array.isArray(mapa) || typeof mapa !== 'object') return {};
    return Object.fromEntries(Object.entries(mapa).filter(([, servicos]) =>
      Array.isArray(servicos) && servicos.every(s => ['AGUA','GAS','ENERGIA'].includes(s))));
  } catch { return {}; } // Não inventa dispensas quando o cache precisa ser recuperado.
};
export const unidadeSemMedidor = (id, unidade, servico) =>
  lerUnidadesSemMedidor(id)[String(unidade).trim()]?.includes(String(servico).toUpperCase()) === true;

export async function carregarUnidadesSemMedidor(id) {
  const contexto = await capturarContextoSync(supabase.auth, criarClienteParaToken);
  if (!contexto) return lerUnidadesSemMedidor(id);
  const { data, error } = await contexto.client.from('unidades')
    .select('nome,servicos_sem_medidor').eq('condominio_id', id);
  contexto.assertActive();
  if (error) throw error;
  const mapa = Object.fromEntries((data || []).map(u => [u.nome, u.servicos_sem_medidor || []]));
  localStorage.setItem(chave(id), JSON.stringify(mapa));
  return mapa;
}

// A configuração é permanente e por serviço, nunca inferida de uma leitura zero.
export async function definirUnidadeSemMedidor(id, unidade, servico, dispensada) {
  const contexto = await capturarContextoSync(supabase.auth, criarClienteParaToken);
  if (!contexto) throw new Error('Conecte à internet para configurar uma unidade sem medidor.');
  const { data, error } = await contexto.client.rpc('configurar_unidade_sem_medidor', {
    p_condominio_id: id, p_unidade: String(unidade).trim(),
    p_servico: String(servico).toUpperCase(), p_sem_medidor: dispensada,
  });
  contexto.assertActive();
  if (error) throw error;
  const mapa = lerUnidadesSemMedidor(id);
  mapa[unidade] = data || [];
  localStorage.setItem(chave(id), JSON.stringify(mapa));
  return mapa;
}
