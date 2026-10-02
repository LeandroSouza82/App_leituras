import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { transformWithEsbuild } from 'vite';
import { obterPadraoVisor, salvarPadraoVisor } from '../src/utils/ocrConfig.js';

// O renderer não implementa portais/layout. Só esses limites e a ponte nativa
// são simulados; o componente, a sessão e o preparo da imagem são os reais.
const require = createRequire(import.meta.url);
const modulo = codigo => `data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`;
const servico = new URL('../src/services/ocrCameraService.js', import.meta.url).href;
const arquivo = new URL('../src/components/OcrCamera/OcrCamera.jsx', import.meta.url);
const substituicoes = {
  'react-dom': modulo('export const createPortal = children => children;'),
  '@capacitor/core': modulo('export const Capacitor = { isNativePlatform: () => true };'),
  '@capacitor/app': modulo(`export const App = { addListener: async (evento, fn) => {
    const h = globalThis.__ocrCameraTeste; h.listeners.set(evento, fn);
    return { remove: async () => h.listeners.delete(evento) };
  } };`),
  '../../services/ocrCameraService': modulo(`import { criarSessaoCameraOcr as criarSessao } from ${JSON.stringify(servico)};
    export const criarSessaoCameraOcr = () => criarSessao(globalThis.__ocrCameraTeste.plugin);`),
  '../../utils/ocrEnquadramento': new URL('../src/utils/ocrEnquadramento.js', import.meta.url).href,
  '../../utils/ocrConfig': new URL('../src/utils/ocrConfig.js', import.meta.url).href,
};
const fonte = await transformWithEsbuild(await readFile(arquivo, 'utf8'), arquivo.pathname,
  { loader: 'jsx', format: 'esm', define: { 'import.meta.env.VITE_OCR_DIAGNOSTICO': '"true"' } });
const codigo = fonte.code.replace(/import ['"]\.\/OcrCamera\.css['"];?/, '')
  .replace(/from (['"])([^'"]+)\1/g, (_, aspas, nome) =>
    `from ${JSON.stringify(substituicoes[nome] || pathToFileURL(require.resolve(nome)).href)}`);
const { default: OcrCamera } = await import(modulo(codigo));

const diferido = () => {
  let resolve, reject;
  const promise = new Promise((r, e) => { resolve = r; reject = e; });
  return { promise, resolve, reject };
};

async function montar(t, perfil = { inteiros: 5, decimais: 3 }) {
  const anteriores = Object.fromEntries(['document', 'window', 'Image', 'localStorage', '__ocrCameraTeste']
    .map(nome => [nome, Object.getOwnPropertyDescriptor(globalThis, nome)]));
  const classes = new Set(), chamadas = [], fotos = [], desenhos = [], listeners = new Map();
  const h = { chamadas, fotos, desenhos, listeners,
    viewport: { left: 30, top: 120, width: 300, height: 400 },
    guia: { left: 60, top: 260, width: 240, height: 80 },
    plugin: {
      start: async opcoes => { chamadas.push(['start', opcoes]); },
      stop: async () => { chamadas.push(['stop']); },
      capture: async () => { chamadas.push(['capture']); return { value: 'Zm90bw==', previewWidth: 480, previewHeight: 640 }; },
      getSupportedFlashModes: async () => ({ result: ['off', 'torch'] }),
      setFlashMode: async () => {},
    },
  };
  globalThis.__ocrCameraTeste = h;
  const preferencias = new Map();
  globalThis.localStorage = { getItem: k => preferencias.get(k) ?? null,
    setItem: (k, v) => preferencias.set(k, v) };
  if (perfil) salvarPadraoVisor('CONDOMINIO TESTE', 'gas', perfil);
  globalThis.window = { innerWidth: 360, innerHeight: 760 };
  const classList = { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) };
  globalThis.document = { documentElement: { classList }, body: { classList }, createElement: () => ({
    width: 0, height: 0, getContext: () => ({ drawImage: (...args) => desenhos.push(args) }),
    toDataURL: (_tipo, q) => `data:image/jpeg;base64,${q}`,
  }) };
  globalThis.Image = class { naturalWidth = 1200; naturalHeight = 1600; async decode() {} };
  let renderer;
  await act(async () => { renderer = create(React.createElement(OcrCamera, {
    unidade: 'UNIDADE TESTE', condominioId: 'CONDOMINIO TESTE', servico: 'gas',
    onCapture: foto => fotos.push(foto), onClose() {}, onGaleria() {},
  }), { createNodeMock: e => ({ getBoundingClientRect: () => e.props.className === 'ocr-camera-guia' ? h.guia : h.viewport }) }); });
  t.after(async () => {
    await act(async () => renderer.unmount());
    fotos.forEach(f => f.imagemOcr.liberar());
    assert.equal(listeners.size, 0);
    assert.equal(classes.size, 0);
    for (const [nome, descriptor] of Object.entries(anteriores)) {
      if (descriptor) Object.defineProperty(globalThis, nome, descriptor);
      else delete globalThis[nome];
    }
  });
  h.capturar = () => renderer.root.findByProps({ className: 'ocr-camera-capturar' });
  h.renderer = renderer;
  h.classes = classes;
  return h;
}

test('rodapé redimensionado permite foto e recorta o guia atual na superfície nativa fixa', async t => {
  const h = await montar(t);
  h.viewport = { left: 45, top: 100, width: 270, height: 360 };
  await act(async () => h.capturar().props.onClick());
  assert.equal(h.fotos.length, 1);
  assert.deepEqual(h.chamadas.map(c => c[0]), ['start', 'capture', 'stop']);
  assert.deepEqual(Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, h.chamadas[0][1][k]])),
    { x: 0, y: 0, width: 360, height: 760 });
  assert.deepEqual(h.desenhos[1].slice(1), [347, 547, 506, 169, 0, 0, 1012, 338]);
  assert.equal(h.fotos[0].fotoComprimida, 'data:image/jpeg;base64,0.3');
  assert.equal(h.fotos[0].imagemOcr.ler(), 'data:image/jpeg;base64,0.95');
  assert.deepEqual(h.fotos[0].imagemOcr.padrao, { inteiros: 5, decimais: 3 });
  assert.equal(h.classes.size, 0);
});
test('falha nativa encerra a câmera, informa a etapa no teste e permite tentar novamente', async t => {
  const h = await montar(t), capture = h.plugin.capture;
  h.plugin.capture = async () => { throw new Error('Camera preview is not ready'); };
  await act(async () => h.capturar().props.onClick());
  assert.equal(h.fotos.length, 0);
  assert.equal(h.classes.size, 0);
  assert.equal(h.chamadas.filter(c => c[0] === 'stop').length, 1);
  const status = h.renderer.root.findByProps({ className: 'ocr-camera-diagnostico' }).children.join('');
  assert.match(status, /Captura da foto: Camera preview is not ready/);
  assert.equal(h.renderer.root.findAllByProps({ role: 'alert' }).length, 1);
  h.plugin.capture = capture;
  const novamente = h.renderer.root.findAllByType('button').find(b => b.children.includes('Tentar novamente'));
  await act(async () => novamente.props.onClick());
  await act(async () => h.capturar().props.onClick());
  assert.equal(h.fotos.length, 1);
});
test('mudança real da janela recusa foto para evitar recorte desalinhado e libera a câmera', async t => {
  const h = await montar(t);
  globalThis.window.innerWidth = 760;
  globalThis.window.innerHeight = 360;
  await act(async () => h.capturar().props.onClick());
  assert.equal(h.fotos.length, 0);
  assert.deepEqual(h.chamadas.map(c => c[0]), ['start', 'stop']);
  assert.equal(h.classes.size, 0);
  assert.match(h.renderer.root.findByProps({ className: 'ocr-camera-diagnostico' }).children.join(''), /Área da câmera/);
});
test('cancelar durante o preparo descarta o recorte e não entrega foto a outra leitura', async t => {
  const h = await montar(t), gate = diferido(), entrou = diferido();
  globalThis.Image.prototype.decode = async () => { entrou.resolve(); await gate.promise; };
  let foto;
  await act(async () => { foto = h.capturar().props.onClick(); await entrou.promise; });
  await act(async () => h.renderer.root.findByProps({ 'aria-label': 'Cancelar foto' }).props.onClick());
  await act(async () => { gate.resolve(); await foto; });
  assert.equal(h.fotos.length, 0);
  assert.equal(h.classes.size, 0);
  assert.equal(h.chamadas.filter(c => c[0] === 'stop').length, 1);
});

test('sem confirmação o padrão sugerido na interface não vira configuração nem metadado da foto', async t => {
  const h = await montar(t, null);
  assert.equal(obterPadraoVisor('CONDOMINIO TESTE', 'gas'), null);
  await act(async () => h.capturar().props.onClick());
  assert.equal(h.fotos.length, 1); // A foto e o lançamento manual continuam disponíveis.
  assert.equal(h.fotos[0].imagemOcr.padrao, null);
});

test('confirmação na câmera guarda o padrão por serviço e o vincula à captura', async t => {
  const h = await montar(t, null);
  const confirmar = h.renderer.root.findAllByType('button').find(b => b.children.includes('Confirmar visor'));
  await act(async () => confirmar.props.onClick());
  assert.deepEqual(obterPadraoVisor('CONDOMINIO TESTE', 'gas'), { inteiros: 5, decimais: 3 });
  assert.equal(obterPadraoVisor('CONDOMINIO TESTE', 'agua'), null);
  await act(async () => h.capturar().props.onClick());
  assert.deepEqual(h.fotos[0].imagemOcr.padrao, { inteiros: 5, decimais: 3 });
});

test('editar o padrão sem confirmar não usa a preferência anterior nessa foto', async t => {
  const h = await montar(t);
  const ajustar = h.renderer.root.findAllByType('button').find(b => b.children.includes(' decimais · Ajustar'));
  await act(async () => ajustar.props.onClick());
  await act(async () => h.renderer.root.findByProps({ 'aria-label': 'Dígitos decimais do visor' })
    .props.onChange({ target: { value: '2' } }));
  await act(async () => h.capturar().props.onClick());
  assert.equal(h.fotos[0].imagemOcr.padrao, null);
  assert.deepEqual(obterPadraoVisor('CONDOMINIO TESTE', 'gas'), { inteiros: 5, decimais: 3 });
});
