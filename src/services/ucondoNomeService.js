import { supabase, criarClienteParaToken } from './supabase';
import { exigirContaOffline, capturarContextoSync } from './offlineQueueStorage';

const chave = id => `nome_ucondo_planilha_${exigirContaOffline()}_${id}`;
export async function sincronizarNomePlanilhaUcondo(id, nomeOficial = null, client = null) {
  const owner = exigirContaOffline();
  const key = chave(id);
  if (typeof nomeOficial === 'string' && nomeOficial.trim()) {
    localStorage.setItem(key, nomeOficial.trim());
  }
  const nome = localStorage.getItem(key);
  if (!nome) return;
  const contexto = client ? { client, assertActive: () => exigirContaOffline(owner) }
    : await capturarContextoSync(supabase.auth, criarClienteParaToken);
  if (!contexto) return;
  const { data, error } = await contexto.client.from('condominios').update({ nome_ucondo: nome })
    .eq('id', id).eq('user_id', owner).select('id');
  contexto.assertActive();
  if (error) throw error;
  if (data?.length !== 1) throw new Error('O nome da planilha aguarda a sincronização do cadastro.');
  localStorage.removeItem(key);
}
