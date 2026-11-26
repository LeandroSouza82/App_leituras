import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { formatarValorLeitura, gerarArquivoConsumos, ordenarLinhasConsumos } from '../src/services/planilhaUcondo.js';
import { gerarPlanilhaEquipe, montarConsumosEquipe } from '../src/services/planilhaEquipe.js';

const modelo = await readFile(new URL('../public/modelos/ucondo-consumos.xlsx', import.meta.url));

async function abrir(bytes) {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(bytes);
  return livro;
}
const abaModelo = (await abrir(modelo)).getWorksheet('Consumos');

const unidades = [
  { numero: 'LOJA-001', servicos_sem_medidor: ['GAS'] },
  { numero: 'AP-102', servicos_sem_medidor: [] },
  { numero: 'AP-1001', servicos_sem_medidor: [] },
  { numero: 'AP-101', servicos_sem_medidor: [] },
  { numero: 'AP-201', servicos_sem_medidor: ['AGUA'] },
];
const leitura = (unidade_id, servico, leitura_atual, data_leitura = '2026-11-20T12:00:00Z') =>
  ({ unidade_id, servico, leitura_atual, data_leitura });

// O Excel trata alinhamento ausente, "general" e "false"/0 como o mesmo padrão; o ExcelJS omite esses padrões ao gravar.
const estilo = celula => {
  const copia = JSON.parse(JSON.stringify(celula.style));
  if (copia.alignment) {
    copia.alignment = Object.fromEntries(Object.entries(copia.alignment).filter(([chave, valor]) =>
      valor !== false && valor !== 0 && !(chave === 'horizontal' && valor === 'general')));
  }
  return copia;
};

function conferirComoModelo(aba, linhasEsperadas) {
  for (const endereco of ['A1', 'B1']) {
    assert.equal(aba.getCell(endereco).value, abaModelo.getCell(endereco).value);
    assert.deepEqual(estilo(aba.getCell(endereco)), estilo(abaModelo.getCell(endereco)), endereco);
  }
  assert.equal(aba.getCell('A1').font.bold, true);
  assert.equal(aba.getCell('A1').font.name, 'Calibri');
  assert.equal(aba.getCell('A1').font.size, 11);
  assert.equal(aba.getCell('A1').fill.fgColor.argb, 'FF8F3ACE');
  assert.equal(aba.getCell('A1').numFmt, '@');
  for (let coluna = 1; coluna <= 16; coluna++) {
    assert.equal(aba.getColumn(coluna).width, abaModelo.getColumn(coluna).width, 'largura da coluna ' + coluna);
  }
  linhasEsperadas.forEach(([unidade, valor], indice) => {
    const linha = indice + 2;
    for (const [coluna, esperado] of [['A', unidade], ['B', valor]]) {
      const celula = aba.getCell(coluna + linha);
      assert.equal(celula.value, esperado, coluna + linha);
      assert.equal(celula.type, ExcelJS.ValueType.String, coluna + linha);
      assert.deepEqual(estilo(celula), estilo(abaModelo.getCell(coluna + '2')), coluna + linha);
    }
  });
  assert.equal(aba.getCell('A' + (linhasEsperadas.length + 2)).value, null);
  assert.ok(!linhasEsperadas.some(([unidade]) => unidade === 'A-101'));
}

test('formata leitura com 4 casas e ponto decimal', () => {
  assert.equal(formatarValorLeitura('1.080,58'), '1080.5800');
  assert.equal(formatarValorLeitura(0), '0.0000');
  assert.equal(formatarValorLeitura(''), '');
});

test('ordena em ordem crescente natural: apartamentos e depois lojas', () => {
  const ordem = ordenarLinhasConsumos(['LOJA-002', 'AP-1001', 'AP-201', 'LOJA-001', 'AP-102', 'AP-101'].map(unidade => ({ unidade })));
  assert.deepEqual(ordem.map(l => l.unidade), ['AP-101', 'AP-102', 'AP-201', 'AP-1001', 'LOJA-001', 'LOJA-002']);
});

test('planilha de Equipes sai idêntica ao modelo do uCondo, sem a linha de exemplo', async () => {
  const leituras = [
    leitura('AP-101', 'GAS', 1080.58),
    leitura('AP-102', 'GAS', 10, '2026-11-02T12:00:00Z'),
    leitura('AP-102', 'GAS', 211.434, '2026-11-21T12:00:00Z'),
    leitura('AP-1001', 'GAS', 5),
    leitura('AP-201', 'GAS', 0.287),
    leitura('LOJA-001', 'GAS', 0),
    leitura('AP-101', 'AGUA', 999),
  ];
  const livro = await abrir(await gerarPlanilhaEquipe(unidades, leituras, 'gas', modelo));
  assert.deepEqual(livro.worksheets.map(aba => aba.name), ['Consumos']);
  conferirComoModelo(livro.getWorksheet('Consumos'), [
    ['AP-101', '1080.5800'],
    ['AP-102', '211.4340'],
    ['AP-201', '0.2870'],
    ['AP-1001', '5.0000'],
    ['LOJA-001', '0.0000'],
  ]);
});

test('dispensada sai 0.0000 mesmo sem leitura e bloqueia listando todas as faltantes', async () => {
  const { linhas, faltando } = montarConsumosEquipe(unidades, [leitura('AP-101', 'AGUA', 12.5)], 'agua');
  assert.deepEqual(faltando, ['LOJA-001', 'AP-102', 'AP-1001']);
  assert.deepEqual(linhas.find(l => l.unidade === 'AP-201'), { unidade: 'AP-201', leitura: '0.0000' });
  await assert.rejects(gerarPlanilhaEquipe(unidades, [leitura('AP-101', 'AGUA', 12.5)], 'agua', modelo),
    /ÁGUA.*LOJA-001, AP-102, AP-1001/s);
});

test('exportação consolidada do card copia o modelo em uma aba por serviço', async () => {
  const livro = await abrir(await gerarArquivoConsumos([
    { nome: 'Água', linhas: [{ unidade: 'AP-102', leitura: '2.0000' }, { unidade: 'AP-101', leitura: '1.5000' }] },
    { nome: 'Gás', linhas: [{ unidade: 'AP-101', leitura: '0.2870' }] },
  ], modelo));
  assert.deepEqual(livro.worksheets.map(aba => aba.name), ['Água', 'Gás']);
  conferirComoModelo(livro.getWorksheet('Água'), [['AP-101', '1.5000'], ['AP-102', '2.0000']]);
  conferirComoModelo(livro.getWorksheet('Gás'), [['AP-101', '0.2870']]);
});
