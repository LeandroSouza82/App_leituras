import test from 'node:test';
import assert from 'node:assert/strict';

import { obterServicosAtivos } from '../src/utils/servicosCondominio.js';

test('identifica os serviços habilitados em condomínios mistos', () => {
  assert.deepEqual(obterServicosAtivos('Água e Gás'), ['agua', 'gas']);
  assert.deepEqual(obterServicosAtivos('Água, Gás e Energia'), ['agua', 'gas', 'energia']);
});

test('identifica condomínios com serviço exclusivo', () => {
  assert.deepEqual(obterServicosAtivos({ tipoLeitura: 'Somente Água' }), ['agua']);
  assert.deepEqual(obterServicosAtivos({ tipo_leitura: 'Somente Gás' }), ['gas']);
  assert.deepEqual(obterServicosAtivos({ tipoLeitura: 'Energia Elétrica' }), ['energia']);
});

test('mantém Água e Gás como padrão para cadastros legados sem tipo', () => {
  assert.deepEqual(obterServicosAtivos(''), ['agua', 'gas']);
  assert.deepEqual(obterServicosAtivos(null), ['agua', 'gas']);
});
