import test from 'node:test';
import assert from 'node:assert/strict';

// Ponte nativa simulada: exercita os proxies reais do Capacitor e a limpeza.
// Não simula a precisão do ML Kit. Os pixels sintéticos exercitam cor e recorte.
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
          const posicao = x + i % w;
          const cor = estado.corPixel?.(posicao) || (posicao >= 300 ? [180, 50, 50] : [30, 30, 30]);
          data[p] = cor[0];
          data[p + 1] = cor[1];
          data[p + 2] = cor[2];
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

const linhaMista = { text: '0001 74m', boundingBox: { left: 100, top: 40, right: 450, bottom: 80 },
  elements: [
    { text: '0001', boundingBox: { left: 100, top: 40, right: 280, bottom: 80 } },
    { text: '74m', boundingBox: { left: 280, top: 40, right: 450, bottom: 80 } },
  ],
};
test('regressão D5: trecho 0001 em linha 0001 74m habilita o recorte validado', async t => {
  const e = preparar(t);
  e.respostas[0] = { text: linhaMista.text, blocks: [{ lines: [linhaMista] }] };
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, '00017,440'); // Resposta simulada da segunda chamada.
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('trecho para localizar não preenche campo quando novo resultado contém letras', async t => {
  const e = preparar(t);
  e.respostas = [0, 1].map(() => ({ text: linhaMista.text, blocks: [{ lines: [linhaMista] }] }));
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('linha sem nenhum elemento puramente numérico não cria âncora artificial', async t => {
  const e = preparar(t);
  const elementos = linhaMista.elements.map(el => ({ ...el, text: 'O001m' }));
  e.respostas[0] = { text: 'O001m 74m', blocks: [{ lines: [{ ...linhaMista, text: 'O001m 74m', elements: elementos }] }] };
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 1);
  assert.equal(r.valor, null);
});

const respostaD6 = () => ({ text: '1021\n0003 5 85 9\n85 9m\n62100n3261D Au', blocks: [{ lines: [
    { text: '1021', elements: [{ text: '1021', boundingBox: { left: 20, top: 10, right: 80, bottom: 30 } }] },
    { text: '0003 5 85 9', elements: [
      { text: '0003', boundingBox: { left: 100, top: 40, right: 220, bottom: 80 } },
      { text: '5', boundingBox: { left: 226, top: 40, right: 256, bottom: 80 } },
      { text: '85', boundingBox: { left: 264, top: 40, right: 324, bottom: 80 } },
      { text: '9', boundingBox: { left: 330, top: 40, right: 360, bottom: 80 } },
    ] },
    { text: '85 9m', elements: [{ text: '85' }, { text: '9m' }] },
    { text: '62100n3261D Au', elements: [] },
  ] }] });

test('prefixo indefinido alinhado aproveita a primeira resposta e limpa seu único temporário', async t => {
  const e = preparar(t);
  e.corPixel = x => x < 223 ? [255, 255, 255] : x < 260 ? [30, 30, 30] : [180, 50, 50];
  e.respostas = [respostaD6()];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00035,859');
  assert.equal(r.sucesso, true);
  assert.equal(e.chamadas.length, 1);
  assert.equal(e.escritas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('caixa preta/vermelha mista não vira prefixo inteiro pela posição', async t => {
  const e = preparar(t);
  e.corPixel = x => (x >= 160 && x < 223) || x >= 260 ? [180, 50, 50] : [30, 30, 30];
  e.respostas = [respostaD6()];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('prefixo com caixa parcialmente fora da foto não recebe cor pela posição', async t => {
  const e = preparar(t);
  e.corPixel = x => x < 223 ? [255, 255, 255] : x < 260 ? [30, 30, 30] : [180, 50, 50];
  const resposta = respostaD6();
  for (const [i, elemento] of resposta.blocks[0].lines[1].elements.entries()) {
    elemento.boundingBox.top = 1230;
    elemento.boundingBox.bottom = i === 0 ? 1290 : 1270; // Foto com 1280 px de altura.
  }
  e.respostas = [resposta];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('regressão D7: linha 0035 859 m interpreta as cores antes de decidir pelo recorte', async t => {
  const e = preparar(t);
  e.respostas = [{ text: 'M02\n0035 859 m\n821R50832610 A', blocks: [{ lines: [
    { text: 'M02', elements: [{ text: 'M02' }] },
    { text: '0035 859 m', elements: [
      { text: '0035', boundingBox: { left: 100, top: 40, right: 280, bottom: 80 } },
      { text: '859', boundingBox: { left: 310, top: 40, right: 450, bottom: 80 } },
      { text: 'm' },
    ] },
    { text: '821R50832610 A', elements: [] },
  ] }] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '0035,859');
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

const respostaD8 = () => {
  const visor = { ...parcial.blocks[0].lines[0], text: '0001?4',
    elements: [{ ...parcial.blocks[0].lines[0].elements[0], text: '0001?4' }] };
  return { text: '101\n0001?4\nB21A9003125D An 01', blocks: [{ lines: [
    { text: '101', elements: [{ text: '101' }] },
    visor,
    { text: 'B21A9003125D An 01', elements: [{ text: 'B21A9003125D' }, { text: 'An' }, { text: '01' }] },
  ] }] };
};

test('regressão D8: caixa 0001?4 permite uma tentativa com contraste e limpa ambos os temporários', async t => {
  const e = preparar(t);
  e.respostas[0] = respostaD8();
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, '00017,440'); // Somente a resposta simulada da segunda chamada.
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('segunda resposta com dúvida não preenche e não inicia uma terceira tentativa', async t => {
  const e = preparar(t);
  e.respostas = [respostaD8(), respostaD8()];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('caixa com dúvida sem evidência vermelha não habilita recorte', async t => {
  const e = preparar(t);
  e.respostas = [respostaD8()];
  e.corPixel = () => [30, 30, 30];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 1);
  assert.equal(r.valor, null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
