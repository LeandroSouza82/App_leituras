import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularTotalFaturado } from '../src/utils/faturamento.js';
import { leiturasParaMes } from '../src/utils/mesLeituras.js';

const condominios = () => [
  ...Array.from({ length: 27 }, (_, i) => ({ id: String(i), valor: 45, completo: true })),
  { id: '27', valor: '110.00', completo: true },
  ...[420, 30, 30].map((valor, i) => ({ id: String(28 + i), valor, completo: false })),
];

test('28 de 31 concluídos: faturado 1325, previsto 1805, faltam 480', () => {
  const dados = condominios();
  const previsto = dados.reduce((total, item) => total + Number(item.valor), 0);
  assert.equal(dados.length, 31);
  assert.equal(dados.filter(item => item.completo).length, 28);
  assert.equal(previsto, 1805);
  assert.equal(calcularTotalFaturado(dados), 1325);
  assert.equal(previsto - calcularTotalFaturado(dados), 480);
});

test('concluir e reabrir um condomínio altera somente seu valor', () => {
  const dados = condominios();
  dados[28].completo = true;
  assert.equal(calcularTotalFaturado(dados), 1745);
  dados[28].completo = false;
  assert.equal(calcularTotalFaturado(dados), 1325);
  assert.equal(calcularTotalFaturado(dados.map(item => ({ ...item, completo: true }))), 1805);
  assert.equal(calcularTotalFaturado(dados.map(item => ({ ...item, completo: false }))), 0);
  assert.equal(calcularTotalFaturado([]), 0);
});

test('conclusões do mês anterior não contam e conclusão offline do mês atual conta', () => {
  const dados = condominios().map(item => ({ ...item, mesReferencia: '2026-11' }));
  assert.equal(calcularTotalFaturado(leiturasParaMes(dados, '2026-12')), 0);
  const pendencias = [{ id: '28', mes_referencia: '2026-12', completo: true }];
  assert.equal(calcularTotalFaturado(leiturasParaMes(dados, '2026-12', pendencias)), 420);
  assert.equal(calcularTotalFaturado(leiturasParaMes(dados, '2026-11')), 1325);
});

test('soma valores em centavos e mantém número inválido fora do total', () => {
  const dados = [0.1, 0.2, '0.30', 'inválido', undefined].map(valor => ({ valor, completo: true }));
  assert.equal(calcularTotalFaturado(dados), 0.6);
});
