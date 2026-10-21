import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { criarCicloMensalStorage } from '../src/services/cicloMensalStorage.js';

// O hook real observa o mês e processa todos os condomínios; somente as
// fronteiras de React, rede e disco são simuladas. Não acessa contas reais.
const bundled = await build({
  stdin: { contents: "export { useLeituras } from './src/hooks/useLeituras.js';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'hook-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /^react$|useDataLeituras$|condominioService$|notificationService$|offlineQueueStorage$|cicloMensalService$/ }, args => ({ path: args.path, namespace: 'hook-test' }));
    plugin.onLoad({ filter: /.*/, namespace: 'hook-test' }, ({ path }) => {
      const prefix = 'const f=globalThis.__cicloHook; ';
      if (path === 'react') return { contents: prefix + 'export const useState=f.useState; export const useMemo=cb=>cb(); export const useEffect=f.useEffect;' };
      if (path.endsWith('useDataLeituras')) return { contents: prefix + 'export const useDataLeituras=()=>f.date;' };
      if (path.endsWith('cicloMensalService')) return { contents: prefix + 'export const cicloMensalService=f.service;' };
      if (path.endsWith('condominioService')) return { contents: 'export const buscarCondominios=async()=>{throw new Error("offline")}; export const alternarStatusLeitura=()=>{}; export const atualizarCondominio=()=>{}; export const deletarCondominio=()=>{}; export const salvarCondominio=()=>{};' };
      if (path.endsWith('notificationService')) return { contents: 'export const NotificationService={cancelForLeitura:async()=>{}};' };
      return { contents: 'export const lerFilaPersistida=()=>[]; export const contaOfflineAtiva=()=>"conta-A"; export const donoDoItem=()=>"conta-A"; export const exigirContaOffline=()=>"conta-A"; export const gravarFilaPersistida=()=>{};' };
    });
  } }],
});

test('hook processa todos os condomínios offline ao virar o mês, antes de liberar os cards', async () => {
  const dados = new Map();
  const storage = {
    get length() { return dados.size; }, key: i => [...dados.keys()][i] ?? null,
    getItem: key => dados.get(key) ?? null, setItem: (key, value) => dados.set(key, String(value)), removeItem: key => dados.delete(key),
  };
  globalThis.localStorage = storage;
  const condominios = [1, 2, 3].map(id => ({ id: String(id), nome: `Condomínio ${id}`, completo: true, mesReferencia: '2026-10' }));
  storage.setItem('condominios_cache', JSON.stringify(condominios));
  const arquivados = [];
  const f = { date: new Date(2026, 9, 31, 23, 59), index: 0, states: [], effects: [], deps: [], pending: [] };
  f.service = criarCicloMensalStorage({ storage, exigirConta: () => 'conta-A', arquivar: async plano => arquivados.push(plano.condId), enfileirar() {}, gerarId: () => crypto.randomUUID() });
  for (const condominio of condominios) {
    await f.service.processar({ condominio, mesAtual: '2026-10' });
    storage.setItem(`valor_${condominio.id}_A-101_agua`, String(100 + Number(condominio.id)));
    storage.setItem(`concluido_${condominio.id}_A-101_agua`, 'true');
  }
  f.useState = initial => {
    const index = f.index++;
    if (!(index in f.states)) f.states[index] = typeof initial === 'function' ? initial() : initial;
    return [f.states[index], value => { f.states[index] = typeof value === 'function' ? value(f.states[index]) : value; }];
  };
  f.useEffect = (callback, deps) => {
    const index = f.index++;
    if (!f.deps[index] || deps.some((value, i) => value !== f.deps[index][i])) {
      f.pending.push(() => { f.effects[index]?.(); f.effects[index] = callback(); });
      f.deps[index] = deps;
    }
  };
  globalThis.__cicloHook = f;
  const { useLeituras } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const feedback = [];
  const onFeedback = (...args) => feedback.push(args);
  const render = () => { f.index = 0; const result = useLeituras(onFeedback); for (const effect of f.pending.splice(0)) effect(); return result; };
  const flush = async () => {
    let result;
    for (let i = 0; i < 12; i++) { await new Promise(setImmediate); result = render(); }
    return result;
  };
  render();
  const antes = await flush();
  assert.equal(antes.preparandoCiclos, false);
  assert.equal(antes.totalConcluidos, 3);
  assert.equal(arquivados.length, 0);
  f.date = new Date(2026, 10, 1);
  assert.equal(render().preparandoCiclos, true);
  const depois = await flush();
  assert.equal(depois.preparandoCiclos, false);
  assert.equal(depois.totalConcluidos, 0);
  assert.deepEqual(arquivados, ['1', '2', '3']);
  for (const condominio of condominios) {
    assert.equal(storage.getItem(`valor_${condominio.id}_A-101_agua`), null);
    assert.equal(JSON.parse(storage.getItem(`leituras_anteriores_${condominio.id}`))[0].leitura_anterior, 100 + Number(condominio.id));
  }
  assert.equal(feedback.length, 0);
});
