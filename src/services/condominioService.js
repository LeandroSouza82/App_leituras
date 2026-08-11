import { supabase } from './supabase';

const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
};

const getAuthenticatedUserId = async () => {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw new Error(`Não foi possível validar a sessão: ${error.message}`);
  }

  if (!data.user) {
    throw new Error('É necessário estar autenticado para acessar os condomínios.');
  }

  return data.user.id;
};

const toDatabaseCondominio = (data, userId) => ({
  ...(userId ? { user_id: userId } : {}),
  nome: String(data.nome || '').trim(),
  tipo_leitura: data.tipoLeitura || 'Água e Gás',
  dia_leitura: Number(data.diaLeitura),
  apartamentos: Number(data.apartamentos),
  valor: Number(data.valor),
  endereco: data.endereco?.trim() || null,
  instrucoes_acesso: data.instrucoesAcesso?.trim() || null,
  telefone_sindico: data.contatoSindico?.trim() || null,
});

const toApplicationCondominio = (row, mesReferencia = getCurrentMonthKey()) => {
  const leituraDoMes = (row.leituras || []).find((leitura) => leitura.mes_referencia === mesReferencia);

  return {
    id: row.id,
    nome: row.nome,
    data: row.created_at || new Date().toISOString(),
    apartamentos: Number(row.apartamentos || 0),
    valor: Number(row.valor || 0),
    diaLeitura: Number(row.dia_leitura || 0),
    tipoLeitura: row.tipo_leitura || 'Água e Gás',
    endereco: row.endereco || '',
    instrucoesAcesso: row.instrucoes_acesso || '',
    contatoSindico: row.telefone_sindico || '',
    completo: Boolean(leituraDoMes?.concluido),
  };
};

const throwDatabaseError = (action, error) => {
  throw new Error(`${action}: ${error?.message || 'erro desconhecido'}`);
};

export const buscarCondominios = async () => {
  try {
    const client = requireSupabase();
    await getAuthenticatedUserId();
    const { data, error } = await client
      .from('condominios')
      .select('*, leituras(*)')
      .order('dia_leitura', { ascending: true });

    if (error) {
      throwDatabaseError('Não foi possível buscar os condomínios', error);
    }

    return (data || []).map((row) => toApplicationCondominio(row));
  } catch (error) {
    throw error instanceof Error ? error : new Error('Não foi possível buscar os condomínios.');
  }
};

export const salvarCondominio = async (condominioData) => {
  try {
    const client = requireSupabase();
    const userId = await getAuthenticatedUserId();
    const { data, error } = await client
      .from('condominios')
      .insert(toDatabaseCondominio(condominioData, userId))
      .select('*, leituras(*)')
      .single();

    if (error) {
      throwDatabaseError('Não foi possível salvar o condomínio', error);
    }

    const mesReferencia = getCurrentMonthKey();
    const { error: leituraError } = await client.from('leituras').insert({
      condominio_id: data.id,
      user_id: userId,
      mes_referencia: mesReferencia,
      concluido: false,
    });

    if (leituraError) {
      await client.from('condominios').delete().eq('id', data.id);
      throwDatabaseError('Não foi possível criar a leitura do mês', leituraError);
    }

    return toApplicationCondominio({ ...data, leituras: [] }, mesReferencia);
  } catch (error) {
    throw error instanceof Error ? error : new Error('Não foi possível salvar o condomínio.');
  }
};

export const atualizarCondominio = async (id, condominioData) => {
  try {
    const client = requireSupabase();
    await getAuthenticatedUserId();
    const { data, error } = await client
      .from('condominios')
      .update(toDatabaseCondominio(condominioData))
      .eq('id', id)
      .select('*, leituras(*)')
      .single();

    if (error) {
      throwDatabaseError('Não foi possível atualizar o condomínio', error);
    }

    return toApplicationCondominio(data);
  } catch (error) {
    throw error instanceof Error ? error : new Error('Não foi possível atualizar o condomínio.');
  }
};

export const deletarCondominio = async (id) => {
  try {
    const client = requireSupabase();
    await getAuthenticatedUserId();
    const { error } = await client.from('condominios').delete().eq('id', id);

    if (error) {
      throwDatabaseError('Não foi possível excluir o condomínio', error);
    }

    return { id };
  } catch (error) {
    throw error instanceof Error ? error : new Error('Não foi possível excluir o condomínio.');
  }
};

export const alternarStatusLeitura = async (condominioId, mesReferencia = getCurrentMonthKey(), statusAtual = false) => {
  try {
    const client = requireSupabase();
    const userId = await getAuthenticatedUserId();
    const concluido = !statusAtual;
    const { data, error } = await client
      .from('leituras')
      .upsert({
        condominio_id: condominioId,
        user_id: userId,
        mes_referencia: mesReferencia,
        concluido,
        data_conclusao: concluido ? new Date().toISOString() : null,
      }, { onConflict: 'condominio_id,mes_referencia' })
      .select()
      .single();

    if (error) {
      throwDatabaseError('Não foi possível atualizar o status da leitura', error);
    }

    return data;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Não foi possível atualizar o status da leitura.');
  }
};
