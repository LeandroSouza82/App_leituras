import { parseLeituraNumerica } from '../utils/leituraNumerica.js';

/** Modelo oficial de importação do uCondo, empacotado em public/modelos. */
export const CAMINHO_MODELO_CONSUMOS = 'modelos/ucondo-consumos.xlsx';
export const ABA_CONSUMOS = 'Consumos';

/** Leitura no formato aceito pelo uCondo: 4 casas com ponto decimal ("1080.5800"); vazio se inválida. */
export function formatarValorLeitura(valor) {
  const num = parseLeituraNumerica(valor);
  return num === null ? '' : num.toFixed(4);
}

const comparador = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Ordem crescente natural: AP-101, AP-102, ..., AP-1001, depois LOJA-001... */
export const ordenarLinhasConsumos = linhas =>
  [...linhas].sort((a, b) => comparador.compare(String(a.unidade), String(b.unidade)));

export async function carregarModeloConsumos() {
  const resposta = await fetch(new URL(CAMINHO_MODELO_CONSUMOS, document.baseURI));
  if (!resposta.ok) throw new Error('Modelo de importação do uCondo não encontrado no aplicativo.');
  return resposta.arrayBuffer();
}

const copiarEstilo = estilo => JSON.parse(JSON.stringify(estilo || {}));

function preencherAba(aba, linhas, estiloA, estiloB) {
  // Apaga a linha de exemplo (A-101) mantendo a formatação do modelo.
  aba.getCell('A2').value = null;
  aba.getCell('B2').value = null;
  ordenarLinhasConsumos(linhas).forEach(({ unidade, leitura }, indice) => {
    const linha = aba.getRow(indice + 2);
    const a = linha.getCell(1);
    const b = linha.getCell(2);
    a.value = String(unidade);
    b.value = String(leitura);
    a.style = copiarEstilo(estiloA);
    b.style = copiarEstilo(estiloB);
  });
}

/**
 * Gera o .xlsx a partir do modelo do uCondo, preservando cabeçalho, estilos e larguras.
 * `abas`: [{ nome, linhas: [{ unidade, leitura }] }]. Com uma aba só, ela continua "Consumos".
 */
export async function gerarArquivoConsumos(abas, modelo) {
  const { default: ExcelJS } = await import('exceljs');
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(modelo ?? await carregarModeloConsumos());
  const base = livro.getWorksheet(ABA_CONSUMOS);
  if (!base) throw new Error('Modelo do uCondo sem a aba Consumos.');
  const estiloA = copiarEstilo(base.getCell('A2').style);
  const estiloB = copiarEstilo(base.getCell('B2').style);

  if (abas.length === 1 && (!abas[0].nome || abas[0].nome === ABA_CONSUMOS)) {
    preencherAba(base, abas[0].linhas, estiloA, estiloB);
  } else {
    const modeloAba = base.model;
    for (const { nome, linhas } of abas) {
      const aba = livro.addWorksheet(nome);
      aba.model = { ...copiarEstilo(modeloAba), id: aba.id, name: nome };
      preencherAba(aba, linhas, estiloA, estiloB);
    }
    livro.removeWorksheet(base.id);
  }
  return livro.xlsx.writeBuffer();
}
