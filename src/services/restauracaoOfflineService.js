import { salvarArquivoSeguro } from './filesystemService.js';
import { temConexaoInternetUtil } from './networkQualityService.js';
import { supabase } from './supabase.js';
import { buscarCondominios } from './condominioService.js';
import { ordenarUnidadesNatural } from '../utils/ordenarUnidades.js';

const TAMANHO_PAGINA = 1000;
const SERVICOS_VALIDOS = new Set(['AGUA', 'GAS', 'ENERGIA']);

const buscarTodasPaginas = async (criarConsulta) => {
  const registros = [];
  let inicio = 0;

  while (true) {
    const { data, error } = await criarConsulta().range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;

    const pagina = Array.isArray(data) ? data : [];
    registros.push(...pagina);

    if (pagina.length < TAMANHO_PAGINA) break;
    inicio += TAMANHO_PAGINA;
  }

  return registros;
};

const extrairNomeUnidade = (registro) => String(
  registro?.numero
  || registro?.identificador
  || registro?.unidade
  || registro?.nome
  || ''
).trim();

const lerUnidadesLocais = (condominioId) => {
  try {
    const raw = localStorage.getItem(`unidades_${condominioId}`);
    if (!raw) return [];
    const unidades = JSON.parse(raw);
    return Array.isArray(unidades) ? ordenarUnidadesNatural(unidades) : [];
  } catch {
    return [];
  }
};

const persistirUnidadesLocais = async (condominioId, unidades) => {
  const ordenadas = ordenarUnidadesNatural(unidades);
  if (ordenadas.length === 0) return false;

  localStorage.setItem(`unidades_${condominioId}`, JSON.stringify(ordenadas));
  await salvarArquivoSeguro(`unidades_${condominioId}.json`, JSON.stringify(ordenadas));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline_cache_hydrated', {
      detail: { condId: String(condominioId) },
    }));
  }

  return true;
};

const resolverCondominioId = (valor, idsValidos, idsPorNome) => {
  const chave = String(valor || '').trim();
  if (idsValidos.has(chave)) return chave;
  return idsPorNome.get(chave) || null;
};

const agruparUnidades = (registros, obterCondominioId, obterUnidade) => {
  const grupos = new Map();

  for (const registro of registros) {
    const condominioId = obterCondominioId(registro);
    const unidade = obterUnidade(registro);
    if (!condominioId || !unidade) continue;

    if (!grupos.has(condominioId)) grupos.set(condominioId, []);
    grupos.get(condominioId).push(unidade);
  }

  return grupos;
};

const restaurarLeiturasAnteriores = ({ detalhes, planilhas, condominios }) => {
  const idPorNome = new Map(condominios.map((condominio) => [condominio.nome, String(condominio.id)]));
  const idsValidos = new Set(condominios.map((condominio) => String(condominio.id)));
  const gruposApp = new Map();
  const unidadesVistas = new Set();

  for (const registro of detalhes) {
    const condominioId = idPorNome.get(registro.condominio_nome);
    const unidade = String(registro.unidade_id || '').trim();
    const servico = String(registro.servico || 'AGUA').toUpperCase();
    if (!condominioId || !unidade || !SERVICOS_VALIDOS.has(servico)) continue;

    const chaveUnidade = `${condominioId}__${servico}__${unidade}`;
    if (unidadesVistas.has(chaveUnidade)) continue;
    unidadesVistas.add(chaveUnidade);

    const chaveGrupo = `${condominioId}__${servico}`;
    if (!gruposApp.has(chaveGrupo)) gruposApp.set(chaveGrupo, []);
    gruposApp.get(chaveGrupo).push({
      unidade,
      leitura_anterior: registro.leitura_atual,
    });
  }

  const gruposPlanilha = new Map();
  for (const registro of planilhas) {
    const condominioId = resolverCondominioId(registro.condominio_nome, idsValidos, idPorNome);
    const unidade = String(registro.unidade || '').trim();
    const servico = String(registro.servico || 'AGUA').toUpperCase();
    if (!condominioId || !unidade || !SERVICOS_VALIDOS.has(servico)) continue;

    const chaveGrupo = `${condominioId}__${servico}`;
    if (gruposApp.has(chaveGrupo)) continue;
    if (!gruposPlanilha.has(chaveGrupo)) gruposPlanilha.set(chaveGrupo, []);
    gruposPlanilha.get(chaveGrupo).push({
      unidade,
      leitura_anterior: registro.leitura_anterior,
    });
  }

  for (const [chaveGrupo, leituras] of gruposApp) {
    const [condominioId, servico] = chaveGrupo.split('__');
    localStorage.setItem(
      `leituras_anteriores_${condominioId}_${servico}`,
      JSON.stringify(leituras)
    );
  }

  for (const [chaveGrupo, leituras] of gruposPlanilha) {
    const [condominioId, servico] = chaveGrupo.split('__');
    const chaveLocal = `leituras_anteriores_${condominioId}_${servico}`;
    if (!localStorage.getItem(chaveLocal)) {
      localStorage.setItem(chaveLocal, JSON.stringify(leituras));
    }
  }
};

/**
 * Baixa os dados necessários para que todos os condomínios possam ser abertos
 * sem internet depois do primeiro acesso autenticado.
 */
export const restaurarDadosParaUsoOffline = async ({ userId, onProgress } = {}) => {
  if (!userId || !supabase) return { status: 'indisponivel', restaurados: 0, total: 0 };
  if (!(await temConexaoInternetUtil())) {
    return { status: 'offline', restaurados: 0, total: 0 };
  }

  const condominios = await buscarCondominios();
  localStorage.setItem('condominios_cache', JSON.stringify(condominios));

  const total = condominios.length;
  onProgress?.({ atual: 0, total });

  if (total === 0) return { status: 'concluido', restaurados: 0, total: 0, semDados: 0 };

  const ids = condominios.map((condominio) => String(condominio.id));
  const idsValidos = new Set(ids);
  const idsPorNome = new Map(condominios.map((condominio) => [condominio.nome, String(condominio.id)]));

  const [unidades, detalhes, planilhas] = await Promise.all([
    buscarTodasPaginas(() => supabase
      .from('unidades')
      .select('*')
      .in('condominio_id', ids)
      .order('condominio_id', { ascending: true })
      .order('id', { ascending: true })),
    buscarTodasPaginas(() => supabase
      .from('leituras_detalhes')
      .select('unidade_id, condominio_nome, servico, leitura_atual, data_leitura')
      .eq('leiturista_id', userId)
      .order('data_leitura', { ascending: false })),
    buscarTodasPaginas(() => supabase
      .from('unidades_leituras')
      .select('condominio_nome, unidade, leitura_anterior, servico, atualizado_em')
      .eq('leiturista_id', userId)
      .order('atualizado_em', { ascending: true })),
  ]);

  restaurarLeiturasAnteriores({ detalhes, planilhas, condominios });

  const unidadesPorCondominio = agruparUnidades(
    unidades,
    (registro) => String(registro.condominio_id || '').trim(),
    extrairNomeUnidade
  );
  const unidadesLegadasPorCondominio = agruparUnidades(
    planilhas,
    (registro) => resolverCondominioId(registro.condominio_nome, idsValidos, idsPorNome),
    (registro) => String(registro.unidade || '').trim()
  );

  let restaurados = 0;
  let semDados = 0;

  for (let indice = 0; indice < condominios.length; indice += 1) {
    const condominio = condominios[indice];
    const condominioId = String(condominio.id);
    const cacheExistente = lerUnidadesLocais(condominioId);

    if (cacheExistente.length === 0) {
      const unidadesNuvem = unidadesPorCondominio.get(condominioId)
        || unidadesLegadasPorCondominio.get(condominioId)
        || [];

      if (await persistirUnidadesLocais(condominioId, unidadesNuvem)) {
        restaurados += 1;
      } else {
        semDados += 1;
      }
    }

    onProgress?.({
      atual: indice + 1,
      total,
      condominio: condominio.nome,
    });
  }

  return { status: 'concluido', restaurados, total, semDados };
};
