import * as XLSX from 'xlsx';
import { parseLeituraNumerica } from '../utils/leituraNumerica.js';

export const COLUNA_UNIDADE = 'Unidade *';
export const COLUNA_LEITURA = 'Leitura atual *';

/** Leitura no formato aceito pelo uCondo: 4 casas com ponto decimal ("1080.5800"); vazio se inválida. */
export function formatarValorLeitura(valor) {
  const num = parseLeituraNumerica(valor);
  return num === null ? '' : num.toFixed(4);
}

/** Monta a aba de importação do uCondo: só "Unidade *" e "Leitura atual *", ambas como texto (@). */
export function criarAbaConsumos(linhas) {
  const aba = XLSX.utils.json_to_sheet(
    linhas.map(({ unidade, leitura }) => ({ [COLUNA_UNIDADE]: unidade, [COLUNA_LEITURA]: leitura })),
    { header: [COLUNA_UNIDADE, COLUNA_LEITURA] },
  );
  const intervalo = XLSX.utils.decode_range(aba['!ref']);
  for (let linha = intervalo.s.r + 1; linha <= intervalo.e.r; linha++) {
    for (const coluna of [0, 1]) {
      const celula = aba[XLSX.utils.encode_cell({ c: coluna, r: linha })];
      if (celula) {
        celula.t = 's';
        celula.v = String(celula.v ?? '');
        celula.z = '@';
      }
    }
  }
  return aba;
}

/** Arquivo .xlsx com uma única aba "Consumos", como o modelo de importação do uCondo. */
export function gerarArquivoConsumos(linhas) {
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, criarAbaConsumos(linhas), 'Consumos');
  return XLSX.write(livro, { bookType: 'xlsx', type: 'array' });
}
