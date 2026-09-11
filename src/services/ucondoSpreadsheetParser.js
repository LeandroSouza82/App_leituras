import * as XLSX from 'xlsx';
import {
  normalizarTexto,
  normalizarNome,
  calcularDistanciaLevenstein,
  extrairServicoDeTexto,
  extrairMetadadosPlanilha
} from './ucondoSpreadsheetMetadata.js';
import {
  extrairDataColunaLeitura,
  ehColunaUnidade,
  ehColunaLeituraAnterior,
  extrairUnidadesELeiturasFromRaw
} from './ucondoSpreadsheetReadings.js';

/**
 * Fachada Pública para processamento de planilhas uCondo.
 *
 * Responsabilidades:
 * - Coordenar módulos especializados (metadados e leituras).
 * - Realizar a conversão segura do workbook para matriz tabular (rawData).
 * - Expor a API pública canônica e retrocompatível para o sistema.
 * - Não conter regras heurísticas de parsing extensas.
 */

// Reexportações públicas para preservar 100% da API existente
export {
  normalizarTexto,
  normalizarNome,
  calcularDistanciaLevenstein,
  extrairServicoDeTexto,
  extrairMetadadosPlanilha,
  extrairDataColunaLeitura,
  ehColunaUnidade,
  ehColunaLeituraAnterior,
};

/**
 * Lê o rawData da primeira aba do workbook de forma resiliente.
 * @param {XLSX.WorkBook|any} fileDataOuWorkbook
 * @param {Function} [lerWorkbookFn]
 * @returns {Array<Array<any>>}
 */
export const obterRawDataDeWorkbook = (fileDataOuWorkbook, lerWorkbookFn) => {
  let workbook = fileDataOuWorkbook;
  if (!workbook || !workbook.SheetNames) {
    if (typeof lerWorkbookFn === 'function') {
      workbook = lerWorkbookFn(fileDataOuWorkbook);
    } else {
      workbook = XLSX.read(fileDataOuWorkbook, { type: 'buffer' });
    }
  }
  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Arquivo de planilha inválido ou sem abas.');
  }
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
};

/**
 * Extrai pares { unidade, leituraAnterior } da planilha delegando ao módulo de leituras.
 * @param {XLSX.WorkBook|any} fileDataOuWorkbook
 * @param {Function} [lerWorkbookFn]
 * @returns {Array<{ unidade: string, leituraAnterior: number|null }>}
 */
export const extrairUnidadesELeituras = (fileDataOuWorkbook, lerWorkbookFn) => {
  const rawData = obterRawDataDeWorkbook(fileDataOuWorkbook, lerWorkbookFn);
  return extrairUnidadesELeiturasFromRaw(rawData);
};

/**
 * Análise completa da planilha coordenando metadados e leituras.
 * @param {XLSX.WorkBook|any} fileDataOuWorkbook
 * @param {Function} [lerWorkbookFn]
 * @returns {{ pares: Array<{ unidade: string, leituraAnterior: number|null }>, metadados: { nome: string, tipoMedicao: string, servico: 'AGUA'|'GAS'|'ENERGIA'|null } }}
 */
export const analisarPlanilhaCompleta = (fileDataOuWorkbook, lerWorkbookFn) => {
  const rawData = obterRawDataDeWorkbook(fileDataOuWorkbook, lerWorkbookFn);
  const pares = extrairUnidadesELeiturasFromRaw(rawData);
  const metadados = extrairMetadadosPlanilha(rawData, '');

  return { pares, metadados };
};
