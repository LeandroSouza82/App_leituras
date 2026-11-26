import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { lerValorIndividual, protegerValoresNoCache } from '../src/utils/valorCondominio.js';

test('o cache legado do leiturista perde o valor recebido do gestor', () => {
  const antigo = { id: 'dona-cacilda', administradorId: 'gestor', nome: 'Dona Cacilda', valor: 650, completo: true };
  assert.deepEqual(protegerValoresNoCache([antigo], 'leiturista'), [
    { ...antigo, compartilhado: true, valor: null },
  ]);
  assert.deepEqual(protegerValoresNoCache([antigo], 'gestor'), [antigo]);
  assert.deepEqual(protegerValoresNoCache([{ ...antigo, compartilhado: true, valor: 275.5 }], 'leiturista'), [
    { ...antigo, compartilhado: true, valor: 275.5 },
  ]);
});

test('o valor individual aceita zero e centavos e recusa campo vazio ou inválido', () => {
  assert.equal(lerValorIndividual('0'), 0);
  assert.equal(lerValorIndividual('R$ 1.234,56'), 1234.56);
  assert.equal(lerValorIndividual('275.50'), 275.5);
  for (const invalido of ['', ' ', '-1', '1,234', '12x', '10000000000', Infinity]) {
    assert.equal(lerValorIndividual(invalido), null);
  }
});

async function carregarServico(client) {
  globalThis.__supabaseValorCondominio = client;
  const resultado = await build({
    stdin: { contents: "export * from './src/services/condominioService.js';", resolveDir: process.cwd() },
    bundle: true,
    write: false,
    format: 'esm',
    plugins: [{ name: 'supabase-do-teste', setup(plugin) {
      plugin.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'test-client' }));
      plugin.onLoad({ filter: /.*/, namespace: 'test-client' }, () => ({
        contents: 'export const supabase = globalThis.__supabaseValorCondominio;',
      }));
    } }],
  });
  return import('data:text/javascript;base64,' + Buffer.from(resultado.outputFiles[0].text + '\n// ' + crypto.randomUUID()).toString('base64'));
}

test('a consulta antiga do card compartilhado seleciona dados sem pedir o valor do gestor', async () => {
  const proprio = { id: 'proprio', user_id: 'leiturista', valor: 220 };
  const compartilhado = { id: 'compartilhado', user_id: 'gestor', apartamentos: 32, endereco: 'Portaria' };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'leiturista' } } } }) },
    from: () => ({ select: colunas => ({
      eq(campo, dono) {
        assert.deepEqual([campo, dono], ['user_id', 'leiturista']);
        return { data: [proprio] };
      },
      neq(campo, dono) {
        assert.deepEqual([campo, dono], ['user_id', 'leiturista']);
        assert.ok(!colunas.includes('valor') && !colunas.includes('*'));
        return { data: [compartilhado] };
      },
    }) }),
    rpc: async () => ({ error: { code: 'PGRST202' } }),
  };
  const { buscarCondominios } = await carregarServico(client);
  const dados = await buscarCondominios('2026-11');
  assert.equal(dados.find(item => item.id === 'proprio').valor, 220);
  const card = dados.find(item => item.id === 'compartilhado');
  assert.equal(card.valor, null);
  assert.equal(card.endereco, 'Portaria');
  assert.equal(card.apartamentos, 32);
});

test('editar um card compartilhado envia só o valor individual', async () => {
  const chamadas = [];
  const client = { rpc: async (funcao, parametros) => {
    chamadas.push([funcao, parametros]);
    return { data: 0 };
  } };
  const { atualizarCondominio } = await carregarServico(client);
  assert.deepEqual(await atualizarCondominio('dona-cacilda', { valor: 0 }, { compartilhado: true }), { valor: 0 });
  assert.deepEqual(chamadas, [['equipe_salvar_valor_individual', { p_condominio_id: 'dona-cacilda', p_valor: 0 }]]);
});
