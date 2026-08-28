import { supabase } from './supabase';

// Extrai o primeiro número de um texto de dia (ex: "7 a 10" → 7, "Variado" → null)
const extrairNumeroDia = (diaTexto) => {
  if (!diaTexto) return null;
  const numeroString = String(diaTexto).match(/\d+/)?.[0];
  return numeroString ? Number.parseInt(numeroString, 10) : null;
};

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
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error(`Não foi possível validar a sessão: ${error.message}`);
  }

  if (!data.session?.user) {
    throw new Error('É necessário estar autenticado para acessar os condomínios.');
  }

  return data.session.user.id;
};

const toDatabaseCondominio = (data, userId) => ({
  ...(userId ? { user_id: userId } : {}),
  nome: String(data.nome || '').trim(),
  tipo_leitura: data.tipoLeitura || 'Água e Gás',
  dia_leitura: String(data.diaLeitura || '').trim(),
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
    diaLeitura: String(row.dia_leitura || '').trim(),
    tipoLeitura: row.tipo_leitura || 'Água e Gás',
    endereco: row.endereco || '',
    instrucoesAcesso: row.instrucoes_acesso || '',
    contatoSindico: row.telefone_sindico || '',
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    completo: Boolean(leituraDoMes?.concluido),
  };
};

const throwDatabaseError = (action, error) => {
  throw new Error(`${action}: ${error?.message || 'erro desconhecido'}`);
};

export const buscarCondominios = async () => {
  try {
    const client = requireSupabase();
    const userId = await getAuthenticatedUserId();
    const { data, error } = await client
      .from('condominios')
      .select('*, leituras(*)')
      .eq('user_id', userId);

    if (error) {
      throwDatabaseError('Não foi possível buscar os condomínios', error);
    }

    // Ordena por dia_leitura em JavaScript (seguro para strings e valores "Variado")
    return (data || [])
      .map((row) => toApplicationCondominio(row))
      .sort((a, b) => {
        const diaA = extrairNumeroDia(a.diaLeitura) || Infinity;
        const diaB = extrairNumeroDia(b.diaLeitura) || Infinity;
        return diaA - diaB;
      });
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
    const userId = await getAuthenticatedUserId();
    
    // Constrói um payload seguro com apenas os campos fornecidos e válidos
    const payload = {};
    
    if (condominioData.nome !== undefined) {
      payload.nome = String(condominioData.nome || '').trim();
    }
    if (condominioData.tipoLeitura !== undefined) {
      payload.tipo_leitura = condominioData.tipoLeitura || 'Água e Gás';
    }
    if (condominioData.diaLeitura !== undefined) {
      payload.dia_leitura = String(condominioData.diaLeitura || '').trim();
    }
    if (condominioData.apartamentos !== undefined && condominioData.apartamentos !== null) {
      const apt = Number(condominioData.apartamentos);
      payload.apartamentos = Number.isFinite(apt) ? apt : 0;
    }
    if (condominioData.valor !== undefined && condominioData.valor !== null) {
      const val = Number(condominioData.valor);
      payload.valor = Number.isFinite(val) ? val : 0;
    }
    if (condominioData.endereco !== undefined) {
      payload.endereco = condominioData.endereco?.trim() || null;
    }
    if (condominioData.instrucoesAcesso !== undefined) {
      payload.instrucoes_acesso = condominioData.instrucoesAcesso?.trim() || null;
    }
    if (condominioData.contatoSindico !== undefined) {
      payload.telefone_sindico = condominioData.contatoSindico?.trim() || null;
    }
    if (condominioData.latitude !== undefined && condominioData.latitude !== null) {
      payload.latitude = Number(condominioData.latitude);
    }
    if (condominioData.longitude !== undefined && condominioData.longitude !== null) {
      payload.longitude = Number(condominioData.longitude);
    }
    
    const { data, error } = await client
      .from('condominios')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
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
    const userId = await getAuthenticatedUserId();
    const { error } = await client.from('condominios').delete().eq('id', id).eq('user_id', userId);

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
