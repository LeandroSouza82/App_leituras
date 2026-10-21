import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Executa os módulos oficiais com rede/disco simulados; não usa Supabase nem fotos reais.
const bundled = await build({
  stdin: {
    contents: `export * from './src/services/syncService.js';
      export * from './src/services/syncOfflineService.js';
      export * from './src/services/offlineQueueStorage.js';
      export * from './src/hooks/useOfflineSync.js';
      export { cicloMensalService } from './src/services/cicloMensalService.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'offline-test-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /supabase(?:\.js)?$|networkQualityService(?:\.js)?$|CustomPrompt$|^@capacitor\/(network|filesystem)$|^react$/ }, args =>
      ({ path: args.path, namespace: 'offline-test' }));
    plugin.onLoad({ filter: /.*/, namespace: 'offline-test' }, args => {
      const prefix = 'const f = globalThis.__offlineFixture; ';
      if (/supabase(?:\.js)?$/.test(args.path)) return { contents: prefix + 'export const supabase=f.supabase; export const criarClienteParaToken=f.createClient;' };
      if (/networkQualityService(?:\.js)?$/.test(args.path)) return { contents: prefix + 'export const temConexaoInternetUtil=async()=>f.online;' };
      if (/CustomPrompt$/.test(args.path)) return { contents: 'export const customAlert=async()=>{};' };
      if (/filesystem$/.test(args.path)) return { contents: prefix + 'export const Filesystem=f.files; export const Directory={Data:"DATA",Cache:"CACHE"}; export const Encoding={UTF8:"utf8"};' };
      if (/network$/.test(args.path)) return { contents: 'export const Network={addListener:async()=>({remove(){}})};' };
      return { contents: 'export const useCallback=f=>f; export const useEffect=()=>{}; export const useRef=v=>({current:v}); export const useState=v=>[v,()=>{}];' };
    });
  } }],
});

const fixture = async () => {
  const data = new Map();
  const events = [];
  globalThis.localStorage = {
    get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key),
  };
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  const f = { data, events, online: false, requests: [], session: { user: { id: 'conta-A' }, access_token: 'token-A' }, onRequest: null };
  f.supabase = { auth: {
    getSession: async () => ({ data: { session: f.session } }),
    getUser: async token => ({ data: { user: { id: token === 'token-A' ? 'conta-A' : 'conta-B' } } }),
  } };
  f.files = {
    readFile: async () => ({ data: Buffer.from('foto simulada').toString('base64') }),
    writeFile: async () => {},
  };
  f.createClient = (token, guard) => ({
    from(table) {
      const request = { table, token, filters: [] };
      const chain = {
        select: (...args) => { if (!request.action) request.action = 'select'; request.columns = args[0]; return chain; },
        eq: (...args) => { request.filters.push(args); return chain; },
        in: (...args) => { request.filters.push(args); return chain; },
        limit: () => chain, single: () => chain, maybeSingle: () => chain,
        insert: payload => { request.action = 'insert'; request.payload = payload; return chain; },
        upsert: (payload, options) => { request.action = 'upsert'; request.payload = payload; request.options = options; return chain; },
        delete: () => { request.action = 'delete'; return chain; },
        async then(resolve, reject) {
          try {
            guard(); f.requests.push(request);
            const result = await f.onRequest?.(request);
            resolve(result || { data: table === 'unidades' ? [{ id: 'u-1', nome: 'A-101' }] : [], error: null });
          } catch (error) { reject(error); }
        },
      };
      return chain;
    },
    storage: { from: () => ({
      upload: async (path, blob) => { guard(); const r = { table: 'storage', action: 'upload', path, token }; f.requests.push(r); return await f.onRequest?.(r) || { error: null }; },
      getPublicUrl: path => ({ data: { publicUrl: `https://storage.invalid/${path}` } }),
    }) },
  });
  globalThis.__offlineFixture = f;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text + `\n// fixture ${crypto.randomUUID()}`).toString('base64')}`);
  mod.prepararContaOffline('conta-A');
  return { f, mod };
};
const leitura = extra => ({
  db_id: crypto.randomUUID(), condominio_id: 'cond-1', condominio_nome: 'Condo', unidade_id: 'A-101',
  servico: 'AGUA', leitura_atual: 228.665, leiturista_id: 'conta-A',
  data_leitura: '2026-09-15T12:00:00Z', mes_referencia: '2026-09', ...extra,
});

test('serviço real retorna false sob quota, sem evento de sucesso nem exclusão da foto', async () => {
  const { f, mod } = await fixture();
  f.data.set('foto_path_cond-1_A-101_agua', 'Backups/Condo/AptoA-101_AGUA.jpg');
  localStorage.setItem = (key, value) => { if (key === 'fila_sync_auto') throw new Error('Quota'); f.data.set(key, value); };
  assert.equal(await mod.salvarLeituraOffline(leitura()), false);
  assert.equal(f.data.get('foto_path_cond-1_A-101_agua'), 'Backups/Condo/AptoA-101_AGUA.jpg');
  assert.equal(f.events.includes('leiturasAtualizadas'), false);
  assert.equal(f.requests.length, 0);
});

test('outubro não substitui setembro e fila corrupta não vira sucesso', async () => {
  const { f, mod } = await fixture();
  assert.equal(await mod.salvarLeituraOffline(leitura()), true);
  assert.equal(await mod.salvarLeituraOffline(leitura({ data_leitura: '2026-10-10T12:00:00Z', mes_referencia: '2026-10' })), true);
  assert.equal(mod.readFilaSync().length, 2);
  f.data.set('fila_sync_auto', '[corrompida');
  assert.equal(await mod.salvarLeituraOffline(leitura()), false);
  assert.equal(f.data.get('fila_sync_auto'), '[corrompida');
});

test('não aceita mês declarado diferente da data enviada ao banco', async () => {
  const { f, mod } = await fixture();
  assert.equal(await mod.salvarLeituraOffline(leitura({ mes_referencia: '2026-10' })), false);
  assert.equal(f.data.has('fila_sync_auto'), false);
});

test('fila sem dono ou de outra conta é preservada sem upload/consulta de condomínio para adotá-la', async () => {
  const { f, mod } = await fixture();
  const items = [{ id: 'antigo', ...leitura({ leiturista_id: null }) }, { id: 'outra', ...leitura({ leiturista_id: 'conta-B' }) }];
  f.data.set('fila_sync_auto', JSON.stringify(items)); f.online = true;
  await mod.sincronizarFilaEmBackground();
  assert.deepEqual(mod.readFilaSync(), items);
  assert.equal(f.requests.length, 0);
});

test('upload e upsert confirmados removem a revisão enviada sem apagar o arquivo local', async () => {
  const { f, mod } = await fixture();
  await mod.salvarLeituraOffline(leitura({ fileName: 'AptoA-101_AGUA.jpg', photoPath: 'Backups/Condo/AptoA-101_AGUA.jpg', photoDirectory: 'DATA' }));
  f.online = true;
  await mod.sincronizarFilaEmBackground();
  assert.equal(mod.readFilaSync().length, 0);
  assert.equal(f.requests.filter(r => r.action === 'upload').length, 1);
  const write = f.requests.find(r => r.table === 'leituras_detalhes');
  assert.equal(write.payload[0].leiturista_id, 'conta-A');
  assert.equal(write.token, 'token-A');
});

test('falha do banco após upload mantém caminho remoto e id para retomada sem outro objeto', async () => {
  const { f, mod } = await fixture();
  await mod.salvarLeituraOffline(leitura({ fileName: 'foto.jpg', photoPath: 'Backups/Condo/foto.jpg', photoDirectory: 'DATA' }));
  f.online = true;
  f.onRequest = r => r.table === 'leituras_detalhes' ? { error: { message: 'indisponível' } } : null;
  await mod.sincronizarFilaEmBackground();
  const pending = mod.readFilaSync()[0];
  const path = pending.remotePath;
  assert.ok(path); assert.ok(pending.db_id);
  f.onRequest = null;
  await mod.sincronizarFilaEmBackground();
  assert.equal(mod.readFilaSync().length, 0);
  assert.deepEqual(f.requests.filter(r => r.action === 'upload').map(r => r.path), [path, path]);
});

test('logout durante upload bloqueia o próximo comando e mantém a pendência', async () => {
  const { f, mod } = await fixture();
  await mod.salvarLeituraOffline(leitura({ fileName: 'foto.jpg', photoPath: 'Backups/Condo/foto.jpg', photoDirectory: 'DATA' }));
  f.online = true;
  f.onRequest = r => { if (r.action === 'upload') { mod.encerrarContaOffline(); f.session = { user: { id: 'conta-B' }, access_token: 'token-B' }; } };
  await mod.sincronizarFilaEmBackground();
  assert.equal(f.requests.filter(r => r.table === 'leituras_detalhes').length, 0);
  assert.equal(mod.readFilaSync().length, 1);
  assert.equal(mod.readFilaSync()[0].leiturista_id, 'conta-A');
});

test('revisão concorrente na resposta do banco não é removida junto com a anterior', async () => {
  const { f, mod } = await fixture();
  await mod.salvarLeituraOffline(leitura());
  f.online = true;
  f.onRequest = r => {
    if (r.table === 'leituras_detalhes') {
      const fila = mod.readFilaSync(); fila[0].leitura_atual = 230;
      mod.writeFilaSync(fila);
    }
  };
  await mod.sincronizarFilaEmBackground();
  assert.equal(mod.readFilaSync()[0].leitura_atual, 230);
});

test('condomínio conserva dono e mês original na reconexão e bloqueia legado sem dono', async () => {
  const { f, mod } = await fixture();
  mod.enfileirarNovoCondominio({ id: 'cond-1', nome: 'Condo', user_id: 'conta-A', mes_referencia: '2026-09' });
  const owned = JSON.parse(f.data.get('fila_sync_condominios'))[0];
  const legacy = { id: 'legado', nome: 'Antigo' };
  f.data.set('fila_sync_condominios', JSON.stringify([owned, legacy])); f.online = true;
  await mod.sincronizarCondominiosOffline();
  assert.deepEqual(JSON.parse(f.data.get('fila_sync_condominios')), [legacy]);
  assert.equal(f.requests.find(r => r.table === 'condominios').payload.user_id, 'conta-A');
  assert.equal(f.requests.find(r => r.table === 'leituras' && r.action === 'insert').payload.mes_referencia, '2026-09');
});

test('lotes de anteriores preservam dois meses e só substituem dados do mesmo mês', async () => {
  const { f, mod } = await fixture();
  const values = [{ unidade: 'A-101', leitura_anterior: 200 }];
  mod.enfileirarLeiturasAnteriores('cond-1', values, 'AGUA', { userId: 'conta-A', mesReferencia: '2026-09' });
  mod.enfileirarLeiturasAnteriores('cond-1', values, 'AGUA', { userId: 'conta-A', mesReferencia: '2026-10' });
  assert.equal(JSON.parse(f.data.get('fila_sync_leituras_anteriores')).length, 2);
  f.online = true;
  await mod.sincronizarLeiturasAnterioresOffline();
  assert.deepEqual(JSON.parse(f.data.get('fila_sync_leituras_anteriores')), []);
  const old = f.requests.filter(r => r.table === 'unidades_leituras' && r.action === 'select');
  assert.deepEqual(old.map(r => r.filters.find(([name]) => name === 'mes_referencia')[1]), ['2026-09', '2026-10']);
});

test('unidade sem correspondência não descarta nem envia parcialmente o lote anterior', async () => {
  const { f, mod } = await fixture();
  mod.enfileirarLeiturasAnteriores('cond-1', [{ unidade: 'A-101', leitura_anterior: 200 }, { unidade: 'A-999', leitura_anterior: 100 }]);
  const original = f.data.get('fila_sync_leituras_anteriores'); f.online = true;
  await mod.sincronizarLeiturasAnterioresOffline();
  assert.equal(f.data.get('fila_sync_leituras_anteriores'), original);
  assert.equal(f.requests.some(r => r.action === 'insert'), false);
});

test('cadastro manual offline usa contrato de condomínio; fila antiga é mantida sem envio', async () => {
  const { f, mod } = await fixture();
  const legacy = [{ tempId: 1, nome: 'Condo antigo sem dono', apartamentos: 7 }];
  f.data.set('leituras_pendentes', JSON.stringify(legacy));
  const hook = mod.useOfflineSync();
  assert.equal(hook.salvarLeituraOffline({ nome: 'Novo', apartamentos: 7, tipoLeitura: 'Água e Gás' }), true);
  assert.equal(JSON.parse(f.data.get('fila_sync_condominios'))[0].user_id, 'conta-A');
  f.online = true;
  await hook.sincronizarFilaPendente();
  assert.deepEqual(JSON.parse(f.data.get('leituras_pendentes')), legacy);
  assert.equal(f.requests.some(r => r.table === 'leituras' && r.payload?.nome), false);
});

test('falha ao remover a fila depois do banco mantém a pendência para conferir/retomar', async () => {
  const { f, mod } = await fixture();
  await mod.salvarLeituraOffline(leitura());
  const original = f.data.get('fila_sync_auto'); f.online = true;
  localStorage.setItem = (key, value) => {
    if (key === 'fila_sync_auto' && value === '[]') throw new Error('Quota durante remoção');
    f.data.set(key, value);
  };
  await mod.sincronizarFilaEmBackground();
  assert.equal(f.data.get('fila_sync_auto'), original);
  assert.equal(f.requests.filter(r => r.table === 'leituras_detalhes').length, 1);
});

test('fila corrompida libera trava do ciclo; após recuperação pode sincronizar', async () => {
  const { f, mod } = await fixture();
  f.online = true; f.data.set('fila_sync_auto', '{inválido');
  await mod.sincronizarFilaEmBackground();
  assert.equal(f.data.get('fila_sync_auto'), '{inválido');
  f.data.set('fila_sync_auto', JSON.stringify([{ id: 'recuperado', ...leitura() }]));
  await mod.sincronizarFilaEmBackground();
  assert.equal(mod.readFilaSync().length, 0);
});

test('SDK oficial conserva token A mesmo se a sessão global mudar e bloqueia fetch após logout', async () => {
  const { mod } = await fixture();
  const result = await build({
    entryPoints: ['src/services/supabase.js'], bundle: true, write: false, platform: 'node', format: 'esm',
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://offline.invalid', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_only' }) },
  });
  const production = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const originalFetch = globalThis.fetch;
  const headers = [];
  try {
    globalThis.fetch = async (url, options) => {
      headers.push(new Headers(options.headers).get('authorization'));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = production.criarClienteParaToken('token-A', () => mod.exigirContaOffline('conta-A'));
    production.supabase.auth.getSession = async () => ({ data: { session: { user: { id: 'conta-B' }, access_token: 'token-B' } } });
    const response = await client.from('leituras_detalhes').select('id');
    assert.equal(response.error, null);
    assert.deepEqual(headers, ['Bearer token-A']);
    mod.encerrarContaOffline();
    const blocked = await client.from('leituras_detalhes').select('id');
    assert.ok(blocked.error);
    assert.deepEqual(headers, ['Bearer token-A']);
  } finally {
    globalThis.fetch = originalFetch;
    production.supabase.auth.stopAutoRefresh();
  }
});


test('virada mensal completa offline mantém fila antiga, arquiva foto e enfileira a anterior no mês novo', async () => {
  const { f, mod } = await fixture();
  const condominio = { id: 'cond-1', nome: 'Condo' };
  await mod.cicloMensalService.processar({ condominio, mesAtual: '2026-09' });
  const leituraAntiga = leitura({ photoPath: 'Backups/Condo/AptoA-101_AGUA.jpg', photoDirectory: 'DATA' });
  assert.equal(await mod.salvarLeituraOffline(leituraAntiga), true);
  const filaAnterior = structuredClone(mod.readFilaSync());
  localStorage.setItem('valor_cond-1_A-101_agua', '228.665');
  localStorage.setItem('concluido_cond-1_A-101_agua', 'true');
  localStorage.setItem('foto_path_cond-1_A-101_agua', leituraAntiga.photoPath);
  const disco = new Map([['DATA/' + leituraAntiga.photoPath, 'foto anterior']]);
  Object.assign(f.files, {
    readdir: async () => ({ files: [] }),
    mkdir: async () => {},
    stat: async ({ path, directory }) => {
      const data = disco.get(`${directory}/${path}`);
      if (!data) throw new Error('File does not exist');
      return { size: data.length };
    },
    copy: async ({ from, directory, to, toDirectory }) => disco.set(`${toDirectory}/${to}`, disco.get(`${directory}/${from}`)),
    writeFile: async ({ path, directory, data }) => disco.set(`${directory}/${path}`, data),
    readFile: async ({ path, directory }) => ({ data: disco.get(`${directory}/${path}`) }),
  });
  assert.equal((await mod.cicloMensalService.processar({ condominio, mesAtual: '2026-10' })).promovidas, 1);
  assert.equal(localStorage.getItem('valor_cond-1_A-101_agua'), null);
  assert.deepEqual(mod.readFilaSync(), filaAnterior);
  const lote = JSON.parse(localStorage.getItem('fila_sync_leituras_anteriores'))[0];
  assert.equal(lote.mes_referencia, '2026-10');
  assert.equal(lote._offline_user_id, 'conta-A');
  assert.equal(lote.leituras[0].leitura_anterior, 228.665);
  assert.equal(disco.get('DATA/' + leituraAntiga.photoPath), 'foto anterior');
  assert.equal([...disco.keys()].some(key => /2026-09.*AptoA-101_AGUA.jpg/.test(key)), true);
  assert.equal(f.requests.length, 0);
});
