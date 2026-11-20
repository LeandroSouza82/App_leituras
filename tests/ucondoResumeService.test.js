import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  stdin: { contents: "export * from './src/services/ucondoResumeService.js';", resolveDir: process.cwd() },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{
    name: 'resume-fixture',
    setup(plugin) {
      plugin.onResolve(
        { filter: /supabase$|offlineQueueStorage$|networkQualityService$|ucondoTransferService$/ },
        args => ({ path: args.path, namespace: 'fixture' })
      );
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
        const f = 'const f=globalThis.__resumeFixture;';
        if (/supabase$/.test(args.path)) {
          return { contents: f + 'export const supabase=f.supabase;export const criarClienteParaToken=()=>f.client;' };
        }
        if (/offlineQueueStorage$/.test(args.path)) {
          return { contents: f + 'export const exigirContaOffline=id=>{if(id!==f.user)throw new Error("conta mudou");return id};' };
        }
        if (/networkQualityService$/.test(args.path)) {
          return { contents: f + 'export const temConexaoInternetUtil=async()=>f.online;' };
        }
        return { contents: f + 'export const processarEnviosUcondo=async uid=>{f.processados.push(uid)};' };
      });
    }
  }]
});

async function createFixture() {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: k => storage.delete(k)
  };
  globalThis.window = { dispatchEvent() {} };

  const f = {
    user: 'A',
    online: true,
    processados: [],
    rpcCalls: [],
    rpcResult: { data: { id: 'req-1' }, error: null },
    lotesAtivos: [],
    trabalhos: [],
    updates: []
  };

  f.supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: f.user }, access_token: 'tok' } } })
    }
  };

  f.client = {
    rpc: async (name, args) => {
      f.rpcCalls.push({ name, args });
      return f.rpcResult;
    },
    from: (table) => {
      let mode = 'select';
      let patch = null;
      const filters = [];
      const q = {
        select() { mode = 'select'; return q; },
        update(p) { mode = 'update'; patch = p; return q; },
        eq(col, val) { filters.push({ op: 'eq', col, val }); return q; },
        in(col, val) { filters.push({ op: 'in', col, val }); return q; },
        limit() { return q; },
        then(resolve, reject) {
          if (mode === 'update') {
            f.updates.push({ table, patch, filters });
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          if (table === 'solicitacoes_lote') {
            return Promise.resolve({ data: f.lotesAtivos, error: null }).then(resolve, reject);
          }
          if (table === 'automacoes_fila') {
            return Promise.resolve({ data: f.trabalhos, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        }
      };
      return q;
    }
  };

  globalThis.__resumeFixture = f;
  const api = await import(
    'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text + '\n// ' + Math.random()).toString('base64')
  );
  return { f, api, storage };
}

test('retomarEnvioUcondo usa RPC transacional quando disponível', async () => {
  const { f, api } = await createFixture();
  const res = await api.retomarEnvioUcondo({
    userId: 'A',
    card: { id: 'req-1', remoto: true, falhou: true, solicitacaoId: 'lote-1', trabalhosIds: ['job-1'] }
  });
  assert.equal(res.modo, 'rpc');
  assert.equal(f.rpcCalls.length, 1);
  assert.deepEqual(f.rpcCalls[0], {
    name: 'retomar_transferencia_ucondo',
    args: { p_transferencia_id: 'req-1' }
  });
});

test('retomarEnvioUcondo no fallback recoloca apenas trabalhos com falha preservando concluídos e sem duplicar', async () => {
  const { f, api } = await createFixture();
  f.rpcResult = { error: { code: 'PGRST202', message: 'Could not find the function' } };
  f.trabalhos = [
    { id: 'job-ok', status: 'concluida' },
    { id: 'job-fail', status: 'erro' }
  ];

  const res = await api.retomarEnvioUcondo({
    userId: 'A',
    card: { id: 'req-1', remoto: true, falhou: true, solicitacaoId: 'lote-1', trabalhosIds: ['job-ok', 'job-fail'] }
  });

  assert.equal(res.modo, 'fallback');
  assert.equal(f.updates.length, 2);
  assert.equal(f.updates[0].table, 'automacoes_fila');
  assert.deepEqual(f.updates[0].patch, { status: 'aguardando', erro_mensagem: null });
  assert.deepEqual(f.updates[0].filters.find(x => x.op === 'in').val, ['job-fail']);
  assert.equal(f.updates[1].table, 'solicitacoes_lote');
  assert.deepEqual(f.updates[1].patch, { status: 'pendente', finalizado_em: null });
});

test('retomarEnvioUcondo bloqueia fallback se já houver outro lote ativo', async () => {
  const { f, api } = await createFixture();
  f.rpcResult = { error: { code: '42883', message: 'function does not exist' } };
  f.lotesAtivos = [{ id: 'outro-lote' }];

  await assert.rejects(
    api.retomarEnvioUcondo({
      userId: 'A',
      card: { id: 'req-1', remoto: true, falhou: true, solicitacaoId: 'lote-1', trabalhosIds: ['job-fail'] }
    }),
    /Já existe outro envio em andamento/
  );
  assert.equal(f.updates.length, 0);
});

test('retomarEnvioUcondo limpa erro de pedido local e reprocessa sem duplicar', async () => {
  const { f, api, storage } = await createFixture();
  storage.set(
    'fastleituras_envios_ucondo_v1_A',
    JSON.stringify([{ id: 'local-1', userId: 'A', erro: 'Falha temporária' }])
  );

  const res = await api.retomarEnvioUcondo({
    userId: 'A',
    card: { id: 'local-1', remoto: false, falhou: true }
  });

  assert.equal(res.modo, 'local');
  assert.deepEqual(f.processados, ['A']);
  const salvo = JSON.parse(storage.get('fastleituras_envios_ucondo_v1_A'));
  assert.equal(salvo.length, 1);
  assert.equal(salvo[0].erro, null);
});

