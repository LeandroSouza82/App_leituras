import test from 'node:test';
import assert from 'node:assert/strict';

// Ponte nativa simulada: exercita os proxies reais do Capacitor e a limpeza.
// Não simula a precisão do ML Kit. Os pixels sintéticos apenas habilitam o recorte.
let estado;
globalThis.androidBridge = {};
globalThis.Capacitor = {
  PluginHeaders: [
    { name: 'Filesystem', methods: ['writeFile', 'deleteFile'].map(name => ({ name, rtype: 'promise' })) },
    { name: 'TextRecognition', methods: [{ name: 'processImage', rtype: 'promise' }] },
  ],
  nativePromise: async (plugin, metodo, opcoes) => {
    if (plugin === 'Filesystem' && metodo === 'writeFile') {
      estado.escritas.push(opcoes);
      estado.aoEscrever?.(estado.escritas.length);
      return { uri: `file:///cache/${opcoes.path}` };
    }
    if (plugin === 'Filesystem' && metodo === 'deleteFile') {
      estado.excluidos.push(opcoes.path);
      return {};
    }
    if (plugin === 'TextRecognition' && metodo === 'processImage') {
      estado.chamadas.push(opcoes.path);
      const resposta = estado.respostas[estado.chamadas.length - 1];
      if (resposta instanceof Error) throw resposta;
      estado.aoReconhecer?.(estado.chamadas.length);
      return resposta;
    }
    throw new Error('Chamada nativa inesperada');
  },
};
const { executarOcr } = await import('../src/utils/ocrService.js');
const parcial = { text: '00017', blocks: [{ lines: [{ text: '00017',
  boundingBox: { left: 100, top: 40, right: 300, bottom: 80 },
  elements: [{ text: '00017', boundingBox: { left: 100, top: 40, right: 300, bottom: 80 } }],
}] }] };

function preparar(t) {
  estado = { escritas: [], excluidos: [], chamadas: [], respostas: [parcial, { text: '00017,440', blocks: [] }] };
  const documentAnterior = globalThis.document;
  const imageAnterior = globalThis.Image;
  globalThis.Image = class {
    naturalWidth = 720;
    naturalHeight = 1280;
    async decode() {}
  };
  globalThis.document = { createElement: () => ({ width: 1, height: 1,
    toDataURL: () => 'data:image/jpeg;base64,eA==',
    getContext: () => ({
      drawImage() {}, putImageData() {},
      getImageData(x, _y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
          const p = i * 4;
          const vermelho = x + i % w >= 300;
          data[p] = vermelho ? 180 : 30;
          data[p + 1] = data[p + 2] = vermelho ? 50 : 30;
          data[p + 3] = 255;
        }
        return { data };
      },
    }),
  }) };
  t.after(() => {
    if (documentAnterior === undefined) delete globalThis.document;
    else globalThis.document = documentAnterior;
    if (imageAnterior === undefined) delete globalThis.Image;
    else globalThis.Image = imageAnterior;
  });
  return estado;
}

test('primeira resposta válida não inicia recorte e limpa seu temporário', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '459,0320', blocks: [] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '459,0320');
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('recorte permite só uma chamada adicional e limpa os dois temporários', async t => {
  const e = preparar(t);
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00017,440');
  assert.equal(e.chamadas.length, 2);
  assert.equal(new Set(e.escritas.map(o => o.path)).size, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('falha no reconhecimento do recorte limpa tudo e não entrega sugestão', async t => {
  const e = preparar(t);
  e.respostas[1] = new Error('falha nativa');
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.sucesso, false);
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('cancelamento após primeira resposta impede iniciar a tentativa extra', async t => {
  const e = preparar(t);
  let ativa = true;
  e.aoReconhecer = () => { ativa = false; };
  await executarOcr('data:image/jpeg;base64,eA==', {}, () => {}, () => ativa);
  assert.equal(e.chamadas.length, 1);
  assert.equal(e.escritas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('cancelamento durante escrita do recorte limpa ambos sem outra chamada', async t => {
  const e = preparar(t);
  let ativa = true;
  e.aoEscrever = n => { if (n === 2) ativa = false; };
  await executarOcr('data:image/jpeg;base64,eA==', {}, () => {}, () => ativa);
  assert.equal(e.escritas.length, 2);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('segunda resposta incompleta termina sem repetir o reconhecimento', async t => {
  const e = preparar(t);
  e.respostas[1] = parcial;
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('duas faixas candidatas impedem escolher um recorte arbitrário', async t => {
  const e = preparar(t);
  e.respostas[0] = { ...parcial, blocks: [{ lines: [parcial.blocks[0].lines[0], parcial.blocks[0].lines[0]] }] };
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('escrita que falha após criar o recorte também solicita limpeza', async t => {
  const e = preparar(t);
  e.aoEscrever = n => { if (n === 2) throw new Error('escrita incompleta'); };
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.sucesso, false);
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(new Set(e.excluidos), new Set(e.escritas.map(o => o.path)));
});
