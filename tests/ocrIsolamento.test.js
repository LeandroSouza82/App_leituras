import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { useOcrLeitura, LIMITE_OCR_MS } from '../src/hooks/useOcrLeitura.js';
import { setOcrAtivo } from '../src/utils/ocrConfig.js';
import { criarImagemTemporariaOcr } from '../src/utils/ocrEnquadramento.js';

const contexto = { condominioId: 'c1', unidadeId: 'unidade-teste-a', servico: 'agua', captureId: 'foto1' };

async function montar({ initialValue = '', ativo = true, leituraAnterior = null, image = 'imagem1' } = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const dados = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: k => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v),
  }});
  setOcrAtivo(ativo);
  const requests = [], resultados = [];
  const reconhecer = (_image, _contexto, registrar, sessaoAtiva, anterior) => new Promise((resolve, reject) => requests.push({resolve, reject, registrar, sessaoAtiva, anterior}));
  let atual, renderer;
  let props = { isOpen: true, image, contexto, initialValue, leituraAnterior, reconhecer,
    onResult: v => resultados.push(v) };
  function View(p) { atual = useOcrLeitura(p); return null; }
  await act(async () => { renderer = create(React.createElement(View, props)); });
  return {
    requests, resultados,
    get atual() { return atual; },
    async mudar(novos) { props = {...props, ...novos}; await act(async () => renderer.update(React.createElement(View, props))); },
    async resolver(index = 0, valor = '246,8020') { await act(async () => requests[index].resolve({sucesso: true, valor})); },
    async limpar() {
      await act(async () => renderer.unmount());
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    },
  };
}

test('reconhecimento recebe a leitura anterior da sessão e descarta a anterior após mudança', async () => {
  const h = await montar({ leituraAnterior: '40,1110' });
  try {
    assert.equal(h.requests[0].anterior, '40,1110');
    await h.mudar({ leituraAnterior: '41,2220' });
    assert.equal(h.requests[0].sessaoAtiva(), false);
    assert.equal(h.requests[1].anterior, '41,2220');
    await h.resolver(0, '45,6780');
    assert.deepEqual(h.resultados, []);
  } finally { await h.limpar(); }
});

test('duas tentativas inconsistentes encerram a sessão sem preencher nem reiniciar o OCR', async () => {
  const h = await montar({ leituraAnterior: '40,1110' });
  try {
    await act(async () => h.requests[0].resolve({ sucesso: true, valor: null, inconsistente: true }));
    assert.equal(h.atual.status, 'inconsistente');
    assert.equal(h.requests[0].sessaoAtiva(), false);
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.resultados, []);
    act(() => h.atual.cancelar());
    assert.equal(h.atual.status, 'idle');
  } finally { await h.limpar(); }
});

test('descartar pixels após a sugestão não reinicia a sessão nem apaga o resultado', async () => {
  const image = criarImagemTemporariaOcr('faixa', true);
  const h = await montar({ image });
  try {
    await h.resolver();
    assert.equal(image.ler(), null);
    assert.equal(h.atual.status, 'concluido');
    assert.deepEqual(h.resultados, ['246,8020']);
    assert.equal(h.requests.length, 1);
  } finally { await h.limpar(); }
});
test('digitar durante OCR libera o recurso e conserva o descarte síncrono da resposta', async () => {
  const image = criarImagemTemporariaOcr('faixa', true);
  const h = await montar({ image });
  try {
    act(() => h.atual.cancelar());
    assert.equal(image.ler(), null);
    await h.resolver(); assert.deepEqual(h.resultados, []);
  } finally { await h.limpar(); }
});
for (const opcoes of [{ ativo: false }, { initialValue: '24,6800' }]) {
  test(`recurso que não precisa de OCR é liberado sem chamar o motor: ${JSON.stringify(opcoes)}`, async () => {
    const image = criarImagemTemporariaOcr('faixa', true);
    const h = await montar({ ...opcoes, image });
    try { assert.equal(image.ler(), null); assert.equal(h.requests.length, 0); }
    finally { await h.limpar(); }
  });
}

test('sugestão única preenche e não salva', async () => {
  const h = await montar();
  try { await h.resolver(); assert.deepEqual(h.resultados, ['246,8020']); assert.equal(h.atual.status, 'concluido'); }
  finally { await h.limpar(); }
});
for (const motivo of ['edição', 'refazer', 'fechar', 'salvar']) {
  test(`cancelamento síncrono ao ${motivo} descarta resposta`, async () => {
    const h = await montar();
    try {
      assert.equal(h.requests[0].sessaoAtiva(), true);
      act(() => h.atual.cancelar());
      assert.equal(h.requests[0].sessaoAtiva(), false);
      await h.resolver(); assert.deepEqual(h.resultados, []);
    }
    finally { await h.limpar(); }
  });
}
for (const novos of [
  { isOpen: false }, { image: 'imagem2', contexto: {...contexto, captureId: 'foto2'} },
  { contexto: {...contexto, unidadeId: 'unidade-teste-b'} }, { contexto: {...contexto, servico: 'gas'} },
  { contexto: {...contexto, condominioId: 'c2'} }, { initialValue: '1,0000' },
  { leituraAnterior: '500,0000' },
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
for (const opcoes of [{ativo:false}, {initialValue:'24,6800'}]) {
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

 test('limite de espera encerra spinner e descarta resultado nativo atrasado', async () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(); let id = 0;
  globalThis.setTimeout = (fn, ms) => { timers.set(++id, {fn, ms}); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  let h;
  try {
    h = await montar();
    assert.equal(h.atual.status, 'processando');
    const timer = [...timers.values()].find(t => t.ms === LIMITE_OCR_MS);
    assert.ok(timer);
    act(() => h.requests[0].registrar('Aguardando motor ML Kit'));
    act(() => timer.fn());
    assert.equal(h.requests[0].sessaoAtiva(), false);
    assert.equal(h.atual.status, 'demorado');
    assert.match(h.atual.diagnostico.at(-2), /Aguardando motor ML Kit/);
    assert.match(h.atual.diagnostico.at(-1), /Limite de espera atingido/);
    const congelado = [...h.atual.diagnostico];
    act(() => h.requests[0].registrar('Resposta atrasada'));
    assert.deepEqual(h.atual.diagnostico, congelado);
    await h.resolver();
    assert.deepEqual(h.resultados, []);
    assert.equal(h.atual.status, 'demorado');
    assert.equal(timers.size, 0);
  } finally {
    if (h) await h.limpar();
    globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear;
  }
});

test('diagnóstico de captura anterior não aparece em nova captura', async () => {
  const h = await montar();
  try {
    act(() => h.requests[0].registrar('Etapa antiga'));
    await h.mudar({ image: 'imagem2', contexto: {...contexto, captureId: 'foto2'} });
    act(() => h.requests[0].registrar('Resposta antiga'));
    assert.equal(h.atual.diagnostico.some(l => /antiga/.test(l)), false);
    act(() => h.atual.cancelar());
    const anterior = [...h.atual.diagnostico];
    act(() => h.requests[1].registrar('Depois da edição'));
    assert.deepEqual(h.atual.diagnostico, anterior);
  } finally { await h.limpar(); }
});

for (const valor of ['2,4560', '24560']) {
  test(`sugestão ${valor} menor que 28,1230 após a máscara não preenche nem sinaliza sucesso`, async () => {
    const h = await montar({ leituraAnterior: '28,1230' });
    try {
      await h.resolver(0, valor);
      assert.deepEqual(h.resultados, []);
      assert.equal(h.atual.status, 'inconsistente');
      assert.match(h.atual.diagnostico.at(-2), /Sugestão: 2,4560; anterior: 28,1230/);
      assert.match(h.atual.diagnostico.at(-1), /descartada: menor/);
      assert.equal(h.requests[0].sessaoAtiva(), false);
      act(() => h.atual.cancelar());
      assert.equal(h.atual.status, 'idle');
    } finally { await h.limpar(); }
  });
}

for (const valor of ['28,1230', '28,5600']) {
  test(`sugestão ${valor} igual ou maior que a anterior continua preenchendo para conferência manual`, async () => {
    const h = await montar({ leituraAnterior: '28,1230' });
    try {
      await h.resolver(0, valor);
      assert.deepEqual(h.resultados, [valor]);
      assert.equal(h.atual.status, 'concluido');
    } finally { await h.limpar(); }
  });
}
