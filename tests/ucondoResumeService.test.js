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

test('retomar com tela desatualizada mostra que o envio já foi concluído sem outro comando', async () => {
  const { f, api } = await createFixture();
  f.rpcResult = { error: { code: '22023', message: 'Este envio já foi concluído' } };
  const res = await api.retomarEnvioUcondo({ userId: 'A', card: { id: 'req-1', remoto: true, falhou: true } });
  assert.deepEqual(res, { modo: 'concluido', mensagem: 'Este envio já foi concluído' });
  assert.equal(f.rpcCalls.length, 1);
  assert.deepEqual(f.updates, []);
});

test('retomar remoto sem RPC transacional preserva a fila', async () => {
  const { f, api } = await createFixture();
  f.rpcResult = { error: { code: 'PGRST202', message: 'Could not find the function' } };
  await assert.rejects(api.retomarEnvioUcondo({ userId: 'A', card: { id: 'req-1', remoto: true, falhou: true } }),
    /Could not find the function/);
  assert.deepEqual(f.updates, []);
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



test('continuarEnvioUcondo chama somente o RPC de continuação e aceita clique repetido', async () => {
  const { f, api } = await createFixture();
  const card = { id: 'req-1', remoto: true, podeContinuar: true };
  f.rpcResult = { data: 'recolocado', error: null };
  assert.equal((await api.continuarEnvioUcondo({ userId: 'A', card })).mensagem,
    'Envio recolocado na fila do robô.');
  f.rpcResult = { data: 'ja_na_fila', error: null };
  assert.equal((await api.continuarEnvioUcondo({ userId: 'A', card })).mensagem,
    'O envio já está na fila do robô.');
  assert.deepEqual(f.rpcCalls, Array(2).fill({
    name: 'continuar_transferencia_ucondo', args: { p_transferencia_id: 'req-1' }
  }));
  assert.deepEqual(f.updates, []);
});

test('continuarEnvioUcondo impede pedidos inelegíveis e mostra a recusa do banco', async () => {
  const { f, api } = await createFixture();
  const card = { id: 'req-1', remoto: true };
  await assert.rejects(api.continuarEnvioUcondo({ userId: 'A', card }), /não pode ser continuado/);
  assert.equal(f.rpcCalls.length, 0);
  f.rpcResult = { data: null, error: { message: 'Aguarde o outro envio terminar.' } };
  await assert.rejects(api.continuarEnvioUcondo({ userId: 'A', card: { ...card, podeContinuar: true } }),
    /Aguarde o outro envio terminar/);
  assert.deepEqual(f.updates, []);
});

test('continuar com tela desatualizada devolve aviso de envio concluído', async () => {
  const { f, api } = await createFixture();
  f.rpcResult = { error: { code: '22023', message: 'Este envio já foi concluído' } };
  const res = await api.continuarEnvioUcondo({ userId: 'A', card: { id: 'req-1', remoto: true, podeContinuar: true } });
  assert.deepEqual(res, { modo: 'concluido', mensagem: 'Este envio já foi concluído' });
  assert.equal(f.rpcCalls.length, 1);
  assert.deepEqual(f.updates, []);
});

test('card concluído nunca dispara comando de retomada nem de continuação', async () => {
  const {f,api}=await createFixture();
  const card={id:'req-1',remoto:true,falhou:true,podeContinuar:true,completo:true};
  assert.equal((await api.retomarEnvioUcondo({userId:'A',card})).modo,'concluido');
  assert.equal((await api.continuarEnvioUcondo({userId:'A',card})).modo,'concluido');
  assert.deepEqual(f.rpcCalls,[]);
  assert.deepEqual(f.updates,[]);
});

test('cadastro que exige conferência não é recolocado na fila', async () => {
  const {f,api}=await createFixture();
  const card={id:'req-1',remoto:true,falhou:true,bloqueiaRetomada:true,podeContinuar:true};
  await assert.rejects(api.retomarEnvioUcondo({userId:'A',card}),/conferência/);
  await assert.rejects(api.continuarEnvioUcondo({userId:'A',card}),/conferência/);
  assert.deepEqual(f.rpcCalls,[]);
});
