import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarCorDigito, interpretarVisor } from '../src/utils/ocrVisor.js';
import { aplicarMascaraLeitura } from '../src/utils/leituraNumerica.js';

const linha = (grupos) => ({ text: grupos.map(g => g.text).join(' '), elements: grupos });
const ler = (linhas) => interpretarVisor([{ lines: linhas }], e => e.cor);
test('visor sem vírgula: pretos e vermelhos respeitam a máscara existente', () => {
  const valor = ler([linha([{ text: '0540', cor: 'preto' }, { text: '77', cor: 'vermelho' }])]);
  assert.equal(valor, '0540,77');
  assert.equal(aplicarMascaraLeitura(valor), '540,7700');
});
test('placa e serial pretos não disputam com um visor preto/vermelho', () => {
  assert.equal(ler([
    { text: 'APTO 408', elements: [] },
    linha([{ text: '123456789', cor: 'preto' }]),
    linha([{ text: '00459', cor: 'preto' }, { text: '0320', cor: 'vermelho' }]),
  ]), '00459,0320');
});
test('não presume decimais em grupo único, cor indefinida ou ordem invertida', () => {
  for (const grupos of [
    [{ text: '054077', cor: 'preto' }],
    [{ text: '0540', cor: 'preto' }, { text: '77', cor: null }],
    [{ text: '77', cor: 'vermelho' }, { text: '0540', cor: 'preto' }],
    [{ text: '0540', cor: 'preto' }, { text: '7', cor: 'vermelho' }, { text: '7', cor: 'preto' }],
    [{ text: '05O0', cor: 'preto' }, { text: '77', cor: 'vermelho' }],
  ]) assert.equal(ler([linha(grupos)]), null);
});
test('dois visores candidatos não são selecionados arbitrariamente', () => {
  const l = linha([{ text: '0540', cor: 'preto' }, { text: '77', cor: 'vermelho' }]);
  assert.equal(ler([l, l]), null);
});
test('classifica pixels com tinta suficiente e recusa reflexo branco', () => {
  assert.equal(classificarCorDigito(new Uint8ClampedArray([180, 40, 40, 255])), 'vermelho');
  assert.equal(classificarCorDigito(new Uint8ClampedArray([40, 40, 40, 255])), 'preto');
  assert.equal(classificarCorDigito(new Uint8ClampedArray([255, 255, 255, 255])), null);
  assert.equal(classificarCorDigito(new Uint8ClampedArray()), null);
});
