import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRecorteEnquadrado, prepararCapturaEnquadrada, criarImagemTemporariaOcr } from '../src/utils/ocrEnquadramento.js';

const viewport = { width: 300, height: 400 };
const guia = { left: 30, top: 160, width: 240, height: 80 };

test('guia em retrato aponta para os pixels da foto, sem usar pixels de tela como pixels de câmera', () => {
  assert.deepEqual(calcularRecorteEnquadrado(1200, 1600, viewport, guia, { width: 480, height: 640 }),
    { left: 120, top: 640, right: 1080, bottom: 960 });
});
test('guia em paisagem preserva a posição da faixa', () => {
  assert.deepEqual(calcularRecorteEnquadrado(1600, 1200, { width: 400, height: 300 },
    { left: 40, top: 120, width: 320, height: 60 }), { left: 160, top: 480, right: 1440, bottom: 720 });
});
for (const [w, h, esperado] of [
  [900, 600, { left: 210, top: 240, right: 690, bottom: 360 }],
  [600, 900, { left: 60, top: 390, right: 540, bottom: 510 }],
]) {
  test(`cover central compensa as partes cortadas na prévia ${w}×${h}`, () => {
    assert.deepEqual(calcularRecorteEnquadrado(w, h, { width: 300, height: 300 },
      { left: 30, top: 120, width: 240, height: 60 }), esperado);
  });
}
for (const [area, faixa, previa] of [
  [{ width: 0, height: 400 }, guia, null],
  [viewport, { ...guia, left: -1 }, null],
  [viewport, { ...guia, left: 200 }, null],
  [viewport, { ...guia, height: NaN }, null],
  [viewport, guia, { width: undefined, height: undefined }],
  [viewport, guia, { width: 640, height: 480 }],
]) {
  test(`geometria inválida ou prévia diferente nunca gera recorte: ${JSON.stringify([area, faixa, previa])}`, () => {
    assert.equal(calcularRecorteEnquadrado(1200, 1600, area, faixa, previa), null);
  });
}

const instalarCanvas = t => {
  const anteriores = [globalThis.document, globalThis.Image];
  const canvases = [], imagens = [], exportacoes = [];
  globalThis.Image = class {
    naturalWidth = 1200;
    naturalHeight = 1600;
    constructor() { imagens.push(this); }
    async decode() {}
  };
  globalThis.document = { createElement: () => {
    const canvas = { width: 0, height: 0, desenhos: [],
      getContext: () => ({ drawImage: (...args) => canvas.desenhos.push(args) }),
      toDataURL: (tipo, qualidade) => {
        const dados = { width: canvas.width, height: canvas.height, qualidade, tipo };
        exportacoes.push(dados);
        return `data:image/jpeg;base64,${Buffer.from(JSON.stringify(dados)).toString('base64')}`;
      },
    };
    canvases.push(canvas);
    return canvas;
  } };
  t.after(() => {
    for (const [i, chave] of ['document', 'Image'].entries()) {
      if (anteriores[i] === undefined) delete globalThis[chave];
      else globalThis[chave] = anteriores[i];
    }
  });
  return { canvases, imagens, exportacoes };
};

test('só a foto completa JPEG 30 segue para salvar; OCR recebe a faixa JPEG 95 descartável', async t => {
  const e = instalarCanvas(t);
  const original = 'data:image/jpeg;base64,T1JJR0lOQUw=';
  const preparada = await prepararCapturaEnquadrada(original, viewport, guia, { width: 480, height: 640 });
  assert.notEqual(preparada.fotoComprimida, original);
  assert.deepEqual(e.exportacoes, [
    { width: 1200, height: 1600, qualidade: 0.3, tipo: 'image/jpeg' },
    { width: 960, height: 320, qualidade: 0.95, tipo: 'image/jpeg' },
  ]);
  assert.notEqual(preparada.fotoComprimida, preparada.imagemOcr.ler());
  assert.equal(preparada.imagemOcr.enquadrada, true);
  assert.deepEqual(e.canvases[1].desenhos[0].slice(1), [120, 640, 960, 320, 0, 0, 960, 320]);
  assert.ok(e.canvases.every(c => c.width === 0 && c.height === 0));
  assert.equal(e.imagens[0].src, '');
  preparada.imagemOcr.liberar();
  assert.equal(preparada.imagemOcr.ler(), null);
  assert.ok(preparada.fotoComprimida); // Apagar OCR não apaga a foto destinada ao armazenamento.
});
test('sem correspondência nativa comprovada mantém a foto comprimida e permite digitação', async t => {
  const e = instalarCanvas(t);
  const preparada = await prepararCapturaEnquadrada('data:image/jpeg;base64,eA==', viewport, guia,
    { width: undefined, height: undefined });
  assert.ok(preparada.fotoComprimida);
  assert.equal(preparada.imagemOcr.ler(), null);
  assert.match(preparada.imagemOcr.erro, /relacionar o guia/);
  assert.equal(e.exportacoes.length, 1);
  assert.ok(e.canvases.every(c => c.width === 0 && c.height === 0));
});
test('falha na decodificação libera os canvases e a referência da foto', async t => {
  const e = instalarCanvas(t);
  globalThis.Image.prototype.decode = async () => { throw new Error('foto inválida'); };
  await assert.rejects(prepararCapturaEnquadrada('inválida', viewport, guia), /foto inválida/);
  assert.ok(e.canvases.every(c => c.width === 0 && c.height === 0));
  assert.equal(e.imagens[0].src, '');
});
test('liberação é idempotente e conserva a identidade do recurso de sessão', () => {
  const recurso = criarImagemTemporariaOcr('imagem', true);
  const identidade = recurso;
  recurso.liberar(); recurso.liberar();
  assert.equal(recurso, identidade);
  assert.equal(recurso.ler(), null);
  assert.equal(recurso.enquadrada, true);
});
