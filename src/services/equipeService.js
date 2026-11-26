import { supabase } from './supabase';
import { obterServicosAtivos } from '../utils/servicosCondominio';
import { getCurrentMonthKey } from '../utils/mesLeituras';
import { parseLeituraNumerica } from '../utils/leituraNumerica.js';
import { linkConvite } from './conviteEquipe';

async function dados(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

async function paginar(consulta) {
  const registros = [];
  const tamanho = 500;
  for (let inicio = 0; ; inicio += tamanho) {
    const pagina = await dados(consulta().range(inicio, inicio + tamanho - 1));
    registros.push(...pagina);
    if (pagina.length < tamanho) return registros;
  }
}

export const listarConvitesEquipe = () => dados(supabase.rpc('equipe_listar_convites'));
export const listarAutoresEquipe = () => dados(supabase.rpc('equipe_listar_autores'));
export const revogarConviteEquipe = (id) => dados(supabase.rpc('equipe_revogar_acesso', { p_convite_id: id }));

const consultarUnidades = (condominioId) => paginar(() => supabase.from('unidades')
  .select('numero, nome, identificador, servicos_sem_medidor').eq('condominio_id', condominioId).order('id'));
const consultarAnteriores = (condominioId, mes) => paginar(() => supabase.from('unidades_leituras')
  .select('unidade, servico, leitura_anterior').eq('condominio_nome', condominioId).eq('mes_referencia', mes).order('id'));

export async function conferirCondominiosEquipe(condominios, mes = getCurrentMonthKey()) {
  const faltando = [];
  for (const condominio of condominios) {
    const [unidades, anteriores] = await Promise.all([
      consultarUnidades(condominio.id),
      consultarAnteriores(condominio.id, mes),
    ]);
    if (!unidades.length) {
      faltando.push(condominio.nome + ' (unidades ainda não sincronizadas)');
      continue;
    }

    const chaves = new Set(anteriores.filter(({ leitura_anterior }) => {
      const numero = parseLeituraNumerica(leitura_anterior);
      return numero !== null && numero >= 0;
    }).map(({ servico, unidade }) => String(servico || 'AGUA').toUpperCase() + ':' + String(unidade).trim()));
    const servicos = obterServicosAtivos(condominio).map(servico => servico.toUpperCase());
    const pendentes = unidades.filter(unidade => servicos.some(servico => {
      const dispensas = unidade.servicos_sem_medidor || [];
      if (dispensas.some(dispensa => String(dispensa).toUpperCase() === servico)) return false;
      return ![unidade.numero, unidade.nome, unidade.identificador].some(
        nome => nome != null && chaves.has(servico + ':' + String(nome).trim()),
      );
    })).length;
    if (pendentes) faltando.push(`${condominio.nome} (${pendentes} unidade(s) sem leitura anterior)`);
  }
  if (faltando.length) {
    throw new Error('Antes de compartilhar, sincronize ou importe as leituras de ' + faltando.join(', ') + '.');
  }
}

export async function criarConviteEquipe(condominios) {
  await conferirCondominiosEquipe(condominios);
  const token = await dados(supabase.rpc('equipe_criar_convite', { p_condominios: condominios.map(c => c.id) }));
  return linkConvite(token);
}

export async function atualizarCondominiosEquipe(id, condominios, idsJaLiberados) {
  await conferirCondominiosEquipe(condominios.filter(c => !idsJaLiberados.includes(c.id)));
  await dados(supabase.rpc('equipe_atualizar_condominios', {
    p_convite_id: id, p_condominios: condominios.map(c => c.id),
  }));
}

export function buscarLeiturasEquipe(condominioId, autorId, mes) {
  if (!condominioId || !autorId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new Error('Selecione o leiturista, o condomínio e o mês.');
  }
  const [ano, mesNum] = mes.split('-').map(Number);
  const inicio = new Date(Date.UTC(ano, mesNum - 1, 1, 3)).toISOString();
  const fim = new Date(Date.UTC(ano, mesNum, 1, 3)).toISOString();
  return paginar(() => supabase.from('leituras_detalhes')
    .select('id, unidade_id, servico, leitura_atual, foto_url, data_leitura')
    .eq('condominio_id', condominioId).eq('leiturista_id', autorId)
    .gte('data_leitura', inicio).lt('data_leitura', fim).order('unidade_id').order('servico').order('id'));
}

export async function abrirFotoEquipe(referencia) {
  const url = new URL(referencia);
  const origem = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
  const prefixo = '/storage/v1/object/public/fotos_leituras/';
  if (url.origin !== origem || !url.pathname.startsWith(prefixo)) throw new Error('Endereço de foto inválido.');
  const caminho = decodeURIComponent(url.pathname.slice(prefixo.length));
  if (caminho.split('/').some(parte => !parte || parte === '.' || parte === '..') || caminho.includes('\\')) {
    throw new Error('Endereço de foto inválido.');
  }
  const foto = await dados(supabase.storage.from('fotos_leituras').download(caminho));
  return URL.createObjectURL(foto);
}
