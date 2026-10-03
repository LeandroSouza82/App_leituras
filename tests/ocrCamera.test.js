import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSessaoCameraOcr } from '../src/services/ocrCameraService.js';

const area = { left: 0, top: 80, width: 300, height: 400 };
const diferido = () => {
  let resolve, reject;
  const promise = new Promise((r, e) => { resolve = r; reject = e; });
  return { promise, resolve, reject };
};
const camera = () => {
  const chamadas = [];
  return { chamadas, start: async opcoes => { chamadas.push(['start', opcoes]); },
    stop: async () => { chamadas.push(['stop']); },
    capture: async opcoes => { chamadas.push(['capture', opcoes]); return { value: 'foto', previewWidth: 480, previewHeight: 640 }; },
    getSupportedFlashModes: async () => ({ result: ['off', 'torch'] }),
    setFlashMode: async opcoes => { chamadas.push(['flash', opcoes]); },
  };
};

test('criar sessão não abre a câmera; captura fica recusada até a primeira prévia pronta', async () => {
  const plugin = camera(), s = criarSessaoCameraOcr(plugin);
  assert.equal(await s.capturar(), null);
  assert.deepEqual(plugin.chamadas, []);
  try {
    assert.equal(await s.abrir(area), true);
    const opcoes = plugin.chamadas[0][1];
    assert.equal(opcoes.position, 'rear'); assert.equal(opcoes.storeToFile, false);
    assert.equal(opcoes.disableExifHeaderStripping, false); assert.equal(opcoes.disableAudio, true);
    assert.equal(opcoes.toBack, true);
    assert.deepEqual(await s.capturar(), { value: 'foto', previewWidth: 480, previewHeight: 640 });
    assert.deepEqual(plugin.chamadas.at(-1), ['capture', { quality: 90 }]);
  } finally { await s.fechar(); }
});
test('montagem descartada antes do início não abre nem para a sessão seguinte', async () => {
  const plugin = camera();
  const descartada = criarSessaoCameraOcr(plugin), seguinte = criarSessaoCameraOcr(plugin);
  const inicio = descartada.abrir(area), fechamento = descartada.fechar();
  try {
    assert.equal(await inicio, false); await fechamento;
    assert.equal(await seguinte.abrir(area), true);
    await descartada.fechar();
    assert.equal(plugin.chamadas.filter(c => c[0] === 'stop').length, 0);
    assert.ok(await seguinte.capturar());
  } finally { await seguinte.fechar(); }
});
test('fechar durante abertura aguarda e libera a câmera antes de abrir outra', async () => {
  const plugin = camera(), gate = diferido(), entrou = diferido();
  const start = plugin.start;
  plugin.start = async o => { await start(o); entrou.resolve(); await gate.promise; };
  const antiga = criarSessaoCameraOcr(plugin), nova = criarSessaoCameraOcr(plugin);
  const abertura = antiga.abrir(area);
  await entrou.promise;
  const parada = antiga.fechar(), proxima = nova.abrir(area);
  gate.resolve();
  try {
    assert.equal(await abertura, false); await parada; await proxima;
    assert.deepEqual(plugin.chamadas.map(c => c[0]), ['start', 'stop', 'start']);
    await antiga.fechar();
    assert.deepEqual(plugin.chamadas.map(c => c[0]), ['start', 'stop', 'start']);
  } finally { await nova.fechar(); }
});
test('cancelamento descarta foto atrasada e toque duplo não cria outra captura', async () => {
  const plugin = camera(), gate = diferido(), entrou = diferido();
  plugin.capture = async () => { plugin.chamadas.push(['capture']); entrou.resolve(); return gate.promise; };
  const s = criarSessaoCameraOcr(plugin);
  await s.abrir(area);
  const foto = s.capturar();
  await entrou.promise;
  assert.equal(await s.capturar(), null);
  const fechada = s.fechar();
  gate.resolve({ value: 'antiga' });
  assert.equal(await foto, null); await fechada;
  assert.deepEqual(plugin.chamadas.map(c => c[0]), ['start', 'capture', 'stop']);
});
test('falha ao abrir ou parar restaura a transparência sem remover classes anteriores', async t => {
  const anterior = globalThis.document;
  const html = new Set(['existente']), body = new Set(['existente']);
  const classes = dados => ({ classList: { contains: c => dados.has(c), add: c => dados.add(c), remove: c => dados.delete(c) } });
  globalThis.document = { documentElement: classes(html), body: classes(body) };
  t.after(() => { if (anterior === undefined) delete globalThis.document; else globalThis.document = anterior; });
  const plugin = camera();
  plugin.start = async () => { throw new Error('permissão negada'); };
  plugin.stop = async () => { throw new Error('parada falhou'); };
  const s = criarSessaoCameraOcr(plugin);
  await assert.rejects(s.abrir(area), /permissão negada/);
  await s.fechar();
  assert.deepEqual([...html], ['existente']); assert.deepEqual([...body], ['existente']);
});
test('fechamento aborta captura pendente sem aguardar uma resposta JPEG que pode nunca chegar', async () => {
  const plugin = camera(), gate = diferido(), entrou = diferido();
  plugin.capture = async () => { entrou.resolve(); return gate.promise; };
  plugin.stop = async () => { plugin.chamadas.push(['stop']); gate.reject(new Error('captura cancelada')); };
  const s = criarSessaoCameraOcr(plugin);
  await s.abrir(area);
  const foto = s.capturar();
  await entrou.promise;
  await s.fechar();
  assert.equal(await foto, null);
  assert.equal(plugin.chamadas.filter(c => c[0] === 'stop').length, 1);
});
test('classe exclusiva do guia é removida sem interferir na transparência anterior', async t => {
  const anterior = globalThis.document;
  const html = new Set(['camera-active']), body = new Set(['camera-active']);
  const classes = dados => ({ classList: { contains: c => dados.has(c), add: c => dados.add(c), remove: c => dados.delete(c) } });
  globalThis.document = { documentElement: classes(html), body: classes(body) };
  t.after(() => { if (anterior === undefined) delete globalThis.document; else globalThis.document = anterior; });
  const s = criarSessaoCameraOcr(camera());
  try {
    await s.abrir(area);
    assert.ok(body.has('ocr-camera-active'));
  } finally { await s.fechar(); }
  assert.deepEqual([...html], ['camera-active']);
  assert.deepEqual([...body], ['camera-active']);
});
test('uma segunda sessão não interrompe uma captura aberta', async () => {
  const plugin = camera(), a = criarSessaoCameraOcr(plugin), b = criarSessaoCameraOcr(plugin);
  try {
    await a.abrir(area);
    await assert.rejects(b.abrir(area), /captura ainda/);
    await b.fechar();
    assert.equal(plugin.chamadas.filter(c => c[0] === 'stop').length, 0);
    assert.ok(await a.capturar());
  } finally { await a.fechar(); }
});
test('iluminação é opcional e nunca liga depois de encerrar', async () => {
  const plugin = camera(), s = criarSessaoCameraOcr(plugin);
  await s.abrir(area);
  assert.deepEqual(await s.modosFlash(), ['off', 'torch']);
  await s.luz(true); await s.fechar(); await s.luz(false);
  assert.deepEqual(plugin.chamadas.filter(c => c[0] === 'flash'), [['flash', { flashMode: 'torch' }]]);
});
