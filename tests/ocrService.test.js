import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarTextoMedidor } from '../src/utils/ocrService.js';
import { aplicarMascaraLeitura } from '../src/utils/leituraNumerica.js';
import { isOcrAtivo, setOcrAtivo, observarOcr } from '../src/utils/ocrConfig.js';

for (const valor of ['13,5950', '459,0320', '00013,5950', '459.0320']) {
  test(`preserva o valor decimal explícito ${valor}`, () => {
    const r = interpretarTextoMedidor(`${valor} m³`);
    assert.equal(r.valor, valor);
    assert.equal(aplicarMascaraLeitura(r.valor), valor.includes('13') ? '13,5950' : '459,0320');
  });
}
for (const texto of ['', null, '13595\nm³', 'Serial 123456\n459,0320',
  '459,0320\n12345', '13,5950\n459,0320', '13,5950\n13,5950',
  '30/09/2026', '30.09.2026', '12345678901', 'ABC459,0320',
  '459,03O0', 'Qn 1.5', '459,0320\n2026', '1.234,5678']) {
  test(`não adivinha separador ou seleciona entre candidatos: ${texto}`, () => {
    assert.equal(interpretarTextoMedidor(texto).valor, null);
  });
}

test('preferência persiste e notifica; falha de armazenamento não simula sucesso', () => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const dados = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: k => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v),
  }});
  let notificacoes = 0;
  const remover = observarOcr(() => notificacoes++);
  try {
    assert.equal(isOcrAtivo(), false);
    assert.equal(setOcrAtivo(true), true);
    assert.equal(isOcrAtivo(), true);
    assert.equal(setOcrAtivo(false), true);
    assert.equal(isOcrAtivo(), false);
    assert.equal(notificacoes, 2);
    remover();
    setOcrAtivo(true);
    assert.equal(notificacoes, 2);
    globalThis.localStorage.setItem = () => { throw Error('quota'); };
    assert.equal(setOcrAtivo(false), false);
    assert.equal(isOcrAtivo(), true);
  } finally {
    remover();
    if (anterior) Object.defineProperty(globalThis, 'localStorage', anterior);
    else delete globalThis.localStorage;
  }
});
