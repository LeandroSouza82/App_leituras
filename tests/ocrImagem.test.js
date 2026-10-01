import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRecorteVisor, realcarContrasteOcr } from '../src/utils/ocrImagem.js';
import { normalizarLinhaVisor } from '../src/utils/ocrVisor.js';

const linha = { text: '00017', boundingBox: { left: 100, top: 200, right: 300, bottom: 240 } };

test('recorte inclui espaço para os decimais omitidos sem definir seu valor', () => {
  assert.deepEqual(calcularRecorteVisor(linha, 720, 1280), {
    base: linha.boundingBox, left: 90, top: 186, right: 470, bottom: 254,
  });
});
test('uma linha já completa tem só margem pequena à direita', () => {
  const r = calcularRecorteVisor({ ...linha, text: '00017 439' }, 720, 1280);
  assert.equal(r.right, 320);
});
test('trecho parcial mantém margem entre roletes para alcançar a cauda do visor', () => {
  const trecho = { text: '0001', trecho: true, boundingBox: { left: 100, top: 200, right: 280, bottom: 240 } };
  assert.equal(calcularRecorteVisor(trecho, 720, 1280).right, 530);
  assert.equal(calcularRecorteVisor({ ...trecho, trecho: false }, 720, 1280).right, 470);
});
test('recorte respeita limites e aceita a união das caixas dos elementos', () => {
  const r = calcularRecorteVisor({ text: '00017', elements: [
    { boundingBox: { left: 0, top: 0, right: 80, bottom: 40 } },
    { boundingBox: { left: 80, top: 0, right: 160, bottom: 40 } },
  ] }, 200, 60);
  assert.deepEqual(r, { base: { left: 0, top: 0, right: 160, bottom: 40 },
    left: 0, top: 0, right: 200, bottom: 54 });
});
test('placa 101, serial, mistura de letras e caixas inválidas não viram visor', () => {
  for (const l of [
    { ...linha, text: '101' }, { ...linha, text: 'B21A9003125D' },
    { ...linha, text: '12345678901' }, { ...linha, text: '0001O' },
    { ...linha, boundingBox: { ...linha.boundingBox, right: 900 } },
    { ...linha, boundingBox: { ...linha.boundingBox, left: NaN } },
    { ...linha, boundingBox: { left: 100, top: 200, right: 101, bottom: 240 } },
    { text: '00017', elements: [] },
  ]) assert.equal(calcularRecorteVisor(l, 720, 1280), null);
});
test('contraste aumenta a separação e preserva os canais alfa', () => {
  const pixels = new Uint8ClampedArray([100, 100, 100, 120, 150, 150, 150, 240]);
  assert.equal(realcarContrasteOcr(pixels), true);
  assert.equal(pixels[0], pixels[1]);
  assert.equal(pixels[1], pixels[2]);
  assert.ok(Math.abs(pixels[0] - pixels[4]) > 200);
  assert.equal(pixels[3], 120);
  assert.equal(pixels[7], 240);
});
test('fundo escuro vira claro sem inventar pixels em imagem sem contraste', () => {
  const pixels = new Uint8ClampedArray([30,30,30,255, 30,30,30,255, 220,220,220,255]);
  assert.equal(realcarContrasteOcr(pixels), true);
  assert.ok(pixels[0] > 240);
  assert.equal(pixels[8], 0);
  const uniforme = new Uint8ClampedArray([230,230,230,255,230,230,230,255]);
  const original = uniforme.slice();
  assert.equal(realcarContrasteOcr(uniforme), false);
  assert.deepEqual(uniforme, original);
  assert.equal(realcarContrasteOcr(new Uint8ClampedArray()), false);
});

test('linha com unidade usa todas as caixas numéricas e exclui a caixa de m3', () => {
  const l = { text: '0035 859 m3', boundingBox: { left: 100, top: 200, right: 650, bottom: 240 }, elements: [
    { text: '0035', boundingBox: { left: 100, top: 200, right: 280, bottom: 240 } },
    { text: '859', boundingBox: { left: 290, top: 200, right: 450, bottom: 240 } },
    { text: 'm3', boundingBox: { left: 550, top: 200, right: 650, bottom: 240 } },
  ] };
  const r = calcularRecorteVisor(normalizarLinhaVisor(l), 720, 1280);
  assert.deepEqual(r.base, { left: 100, top: 200, right: 450, bottom: 240 });
  assert.equal(r.right, 470);
  assert.equal(l.elements.length, 3);
});

test('caixa com dúvida 0001?4 localiza pixels sem corrigir ou apagar o texto', () => {
  const l = { ...linha, text: '0001?4' };
  const r = calcularRecorteVisor(l, 720, 1280);
  assert.deepEqual(r.base, linha.boundingBox);
  assert.ok(r.right > linha.boundingBox.right);
  assert.ok(r.right <= 720);
  assert.equal(l.text, '0001?4');
});

test('dúvidas sem trecho suficiente, letras e excesso de caracteres não localizam visor', () => {
  for (const text of ['??????', '0???4', '0001???4', '?00014', '0001A4', '0001?412345']) {
    assert.equal(calcularRecorteVisor({ ...linha, text }, 720, 1280), null);
  }
});
