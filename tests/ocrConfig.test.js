import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarPadraoVisor, obterPadraoVisor, salvarPadraoVisor, isOcrAtivo, setOcrAtivo } from '../src/utils/ocrConfig.js';

const armazenamento = t => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const dados = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: k => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v),
  } });
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, 'localStorage', anterior);
    else delete globalThis.localStorage;
  });
  return dados;
};

test('padrão de visor fica separado por condomínio e serviço, sem mudar a ativação do OCR', t => {
  armazenamento(t);
  setOcrAtivo(true);
  assert.equal(salvarPadraoVisor('C1', 'gás', { inteiros: 5, decimais: 3 }), true);
  assert.equal(salvarPadraoVisor('C1', 'agua', { inteiros: 4, decimais: 4 }), true);
  assert.deepEqual(obterPadraoVisor('C1', 'GAS'), { inteiros: 5, decimais: 3 });
  assert.deepEqual(obterPadraoVisor('C1', 'agua'), { inteiros: 4, decimais: 4 });
  assert.equal(obterPadraoVisor('C2', 'gas'), null);
  assert.equal(isOcrAtivo(), true);
  setOcrAtivo(false);
  assert.deepEqual(obterPadraoVisor('C1', 'gas'), { inteiros: 5, decimais: 3 });
});

test('configuração inválida, corrompida ou indisponível não habilita preenchimento', t => {
  const dados = armazenamento(t);
  for (const padrao of [null, {}, { inteiros: '5', decimais: 3 }, { inteiros: 5.5, decimais: 3 },
    { inteiros: 0, decimais: 3 }, { inteiros: 7, decimais: 3 }, { inteiros: 5, decimais: -1 },
    { inteiros: 5, decimais: 5 }, { inteiros: 5, decimais: NaN }]) {
    assert.equal(normalizarPadraoVisor(padrao), null);
    assert.equal(salvarPadraoVisor('C1', 'gas', padrao), false);
  }
  assert.equal(salvarPadraoVisor('', 'gas', { inteiros: 5, decimais: 3 }), false);
  assert.equal(salvarPadraoVisor('C1', 'outro', { inteiros: 5, decimais: 3 }), false);
  assert.equal(dados.size, 0);
  dados.set('ocr_visor_["C1","gas"]', '{quebrado');
  assert.equal(obterPadraoVisor('C1', 'gas'), null);
  globalThis.localStorage.setItem = () => { throw Error('quota'); };
  assert.equal(salvarPadraoVisor('C1', 'gas', { inteiros: 5, decimais: 3 }), false);
  globalThis.localStorage.getItem = () => { throw Error('sem acesso'); };
  assert.equal(obterPadraoVisor('C1', 'gas'), null);
});
