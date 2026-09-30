import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { useOcrLeitura } from '../src/hooks/useOcrLeitura.js';
import { setOcrAtivo } from '../src/utils/ocrConfig.js';

const contexto = { condominioId: 'c1', unidadeId: '101', servico: 'agua', captureId: 'foto1' };

async function montar({ initialValue = '', ativo = true } = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const dados = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: k => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v),
  }});
  setOcrAtivo(ativo);
  const requests = [], resultados = [];
  const reconhecer = () => new Promise((resolve, reject) => requests.push({resolve, reject}));
  let atual, renderer;
  let props = { isOpen: true, image: 'imagem1', contexto, initialValue, reconhecer,
    onResult: v => resultados.push(v) };
  function View(p) { atual = useOcrLeitura(p); return null; }
  await act(async () => { renderer = create(React.createElement(View, props)); });
  return {
    requests, resultados,
    get atual() { return atual; },
    async mudar(novos) { props = {...props, ...novos}; await act(async () => renderer.update(React.createElement(View, props))); },
    async resolver(index = 0) { await act(async () => requests[index].resolve({sucesso: true, valor: '459,0320'})); },
    async limpar() {
      await act(async () => renderer.unmount());
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    },
  };
}

test('sugestão única preenche e não salva', async () => {
  const h = await montar();
  try { await h.resolver(); assert.deepEqual(h.resultados, ['459,0320']); assert.equal(h.atual.status, 'concluido'); }
  finally { await h.limpar(); }
});
for (const motivo of ['edição', 'refazer', 'fechar', 'salvar']) {
  test(`cancelamento síncrono ao ${motivo} descarta resposta`, async () => {
    const h = await montar();
    try { act(() => h.atual.cancelar()); await h.resolver(); assert.deepEqual(h.resultados, []); }
    finally { await h.limpar(); }
  });
}
for (const novos of [
  { isOpen: false }, { image: 'imagem2', contexto: {...contexto, captureId: 'foto2'} },
  { contexto: {...contexto, unidadeId: '102'} }, { contexto: {...contexto, servico: 'gas'} },
  { contexto: {...contexto, condominioId: 'c2'} }, { initialValue: '1,0000' },
]) {
  test(`mudança de sessão descarta resposta: ${JSON.stringify(novos)}`, async () => {
    const h = await montar();
    try { await h.mudar(novos); await h.resolver(); assert.deepEqual(h.resultados, []); }
    finally { await h.limpar(); }
  });
}
test('desativar durante processamento descarta resultado', async () => {
  const h = await montar();
  try { await act(async () => setOcrAtivo(false)); await h.resolver(); assert.deepEqual(h.resultados, []); }
  finally { await h.limpar(); }
});
for (const opcoes of [{ativo:false}, {initialValue:'13,5950'}]) {
  test(`não chama motor: ${JSON.stringify(opcoes)}`, async () => {
    const h = await montar(opcoes);
    try { assert.equal(h.requests.length, 0); }
    finally { await h.limpar(); }
  });
}
test('falha no reconhecimento não entrega número e permite continuar', async () => {
  const h = await montar();
  try {
    await act(async () => h.requests[0].reject(Error('falha')));
    assert.equal(h.atual.status, 'erro'); assert.deepEqual(h.resultados, []);
    act(() => h.atual.cancelar()); assert.equal(h.atual.status, 'idle');
  } finally { await h.limpar(); }
});
test('desmontagem descarta resposta pendente', async () => {
  const h = await montar();
  await h.limpar(); await h.resolver(); assert.deepEqual(h.resultados, []);
});
