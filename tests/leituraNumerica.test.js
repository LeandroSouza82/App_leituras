import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aplicarMascaraLeitura,
  formatarDigitosLeitura,
  formatarLeitura4Casas,
  parseLeituraNumerica,
} from '../src/utils/leituraNumerica.js';

test('converte leituras nos formatos usados pelo aplicativo e pelas planilhas', () => {
  assert.equal(parseLeituraNumerica('1.312,3500'), 1312.35);
  assert.equal(parseLeituraNumerica('1,312.3500'), 1312.35);
  assert.equal(parseLeituraNumerica('23,8000'), 23.8);
  assert.equal(parseLeituraNumerica(1660.81), 1660.81);
});

test('rejeita valores ausentes ou inválidos', () => {
  assert.equal(parseLeituraNumerica(null), null);
  assert.equal(parseLeituraNumerica(''), null);
  assert.equal(parseLeituraNumerica('leitura inválida'), null);
  assert.equal(parseLeituraNumerica(Number.NaN), null);
});

test('formata leitura com padrão brasileiro e quatro casas decimais', () => {
  assert.equal(formatarLeitura4Casas(0), '0,0000');
  assert.equal(formatarLeitura4Casas(1312.35), '1.312,3500');
  assert.equal(formatarLeitura4Casas('1.660,8100'), '1.660,8100');
  assert.equal(formatarLeitura4Casas(''), '');
});

test('aplica a máscara canônica durante a digitação', () => {
  assert.equal(formatarDigitosLeitura('238000'), '23,8000');
  assert.equal(formatarDigitosLeitura('16608100'), '1.660,8100');
  assert.equal(aplicarMascaraLeitura('1.312,3500'), '1.312,3500');
});
