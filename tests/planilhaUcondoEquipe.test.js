import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { criarAbaConsumos, formatarValorLeitura } from '../src/services/planilhaUcondo.js';
import { gerarPlanilhaEquipe, montarConsumosEquipe } from '../src/services/planilhaEquipe.js';

const unidades = [
  { numero: 'AP-102', servicos_sem_medidor: [] },
  { numero: 'AP-101', servicos_sem_medidor: [] },
  { nome: 'LOJA-001', servicos_sem_medidor: ['GAS'] },
  { numero: 'AP-201', servicos_sem_medidor: ['AGUA'] },
];
const leitura = (unidade_id, servico, leitura_atual, data_leitura = '2026-11-20T12:00:00Z') =>
  ({ unidade_id, servico, leitura_atual, data_leitura });

test('formata leitura com 4 casas e ponto decimal', () => {
  assert.equal(formatarValorLeitura('1.080,58'), '1080.5800');
  assert.equal(formatarValorLeitura(0), '0.0000');
  assert.equal(formatarValorLeitura(''), '');
});

test('gera a aba Consumos no formato de importação do uCondo, por serviço', () => {
  const leituras = [
    leitura('AP-101', 'GAS', 1080.58),
    leitura('AP-102', 'GAS', 10, '2026-11-02T12:00:00Z'),
    leitura('AP-102', 'GAS', 211.434, '2026-11-21T12:00:00Z'),
    leitura('AP-201', 'GAS', 0.287),
    leitura('LOJA-001', 'GAS', 0),
    leitura('AP-101', 'AGUA', 999),
  ];
  const livro = XLSX.read(gerarPlanilhaEquipe(unidades, leituras, 'gas'), { type: 'array', cellNF: true });
  assert.deepEqual(livro.SheetNames, ['Consumos']);
  const aba = livro.Sheets.Consumos;
  assert.equal(aba['!ref'], 'A1:B5');
  assert.deepEqual(XLSX.utils.sheet_to_json(aba, { header: 1, raw: false }), [
    ['Unidade *', 'Leitura atual *'],
    ['AP-102', '211.4340'],
    ['AP-101', '1080.5800'],
    ['LOJA-001', '0.0000'],
    ['AP-201', '0.2870'],
  ]);
  for (let linha = 2; linha <= 5; linha++) {
    for (const coluna of ['A', 'B']) {
      assert.equal(aba[coluna + linha].t, 's', coluna + linha);
      assert.equal(aba[coluna + linha].z, '@', coluna + linha);
    }
  }
});

test('dispensada sai 0.0000 mesmo sem leitura e bloqueia listando todas as faltantes', () => {
  const { linhas, faltando } = montarConsumosEquipe(unidades, [leitura('AP-101', 'AGUA', 12.5)], 'agua');
  assert.deepEqual(faltando, ['AP-102', 'LOJA-001']);
  assert.deepEqual(linhas.find(l => l.unidade === 'AP-201'), { unidade: 'AP-201', leitura: '0.0000' });
  assert.throws(() => gerarPlanilhaEquipe(unidades, [leitura('AP-101', 'AGUA', 12.5)], 'agua'),
    /ÁGUA.*AP-102, LOJA-001/s);
});

test('a aba compartilhada mantém as duas colunas como texto', () => {
  const aba = criarAbaConsumos([{ unidade: '101', leitura: '5.0000' }]);
  assert.deepEqual([aba.A1.v, aba.B1.v], ['Unidade *', 'Leitura atual *']);
  assert.deepEqual([aba.A2.t, aba.A2.z, aba.B2.t, aba.B2.z, aba.B2.v], ['s', '@', 's', '@', '5.0000']);
});
