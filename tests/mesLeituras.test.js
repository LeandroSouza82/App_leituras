import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentMonthKey, leiturasParaMes } from '../src/utils/mesLeituras.js';

test('desmarca os 16 cards na virada e preserva os dados e o mês anterior', () => {
  const setembro = Array.from({ length: 16 }, (_, id) => ({
    id, nome: `Condomínio ${id}`, valor: 30, diaLeitura: '5',
    mesReferencia: '2026-09', completo: id < 15,
  }));
  const copia = structuredClone(setembro);
  const outubro = leiturasParaMes(setembro, '2026-10');
  assert.equal(outubro.filter((item) => item.completo).length, 0);
  assert.deepEqual(setembro, copia);
  assert.deepEqual(outubro.map(({ completo, mesReferencia, ...dados }) => dados),
    setembro.map(({ completo, mesReferencia, ...dados }) => dados));
});

test('mantém as conclusões do próprio mês ao reabrir offline', () => {
  const outubro = [{ id: 'a', completo: true, mesReferencia: '2026-10' }];
  assert.equal(leiturasParaMes(outubro, '2026-10')[0].completo, true);
  assert.equal(leiturasParaMes(outubro, '2026-11')[0].completo, false);
});

test('aplica apenas pendências do mês correto e respeita o último toque', () => {
  const cards = [{ id: 'a', completo: true, mesReferencia: '2026-09' }];
  const pendencias = [
    { id: 'a', completo: true, mes_referencia: '2026-09' },
    { id: 'a', completo: true, mes_referencia: '2026-10' },
    { id: 'a', completo: false, mes_referencia: '2026-10' },
  ];
  assert.equal(leiturasParaMes(cards, '2026-10', pendencias)[0].completo, false);
  assert.equal(leiturasParaMes(cards, '2026-09', pendencias)[0].completo, true);
  assert.equal(leiturasParaMes(cards, '2026-11', pendencias)[0].completo, false);
});

test('cache legado sem mês não atribui uma conclusão ao mês errado', () => {
  assert.equal(leiturasParaMes([{ id: 'a', completo: true }], '2026-10')[0].completo, false);
});

test('usa o calendário local nas viradas de 28, 29, 30, 31 dias e de ano', () => {
  for (const [ano, mes, dia] of [[2026, 1, 28], [2028, 1, 29], [2026, 8, 30], [2026, 9, 31], [2026, 11, 31]]) {
    const antes = new Date(ano, mes, dia, 23, 59, 59);
    const depois = new Date(ano, mes, dia + 1);
    assert.notEqual(getCurrentMonthKey(antes), getCurrentMonthKey(depois));
    assert.equal(leiturasParaMes([{ id: 'a', completo: true, mesReferencia: getCurrentMonthKey(antes) }],
      getCurrentMonthKey(depois))[0].completo, false);
  }
});
