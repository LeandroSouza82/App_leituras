import { parseLeituraNumerica } from '../utils/leituraNumerica.js';
import { normalizarTexto } from './ucondoSpreadsheetMetadata.js';

/**
 * Módulo puro responsável pelo reconhecimento de colunas e extração de leituras.
 *
 * Responsabilidades:
 * - Identificar coluna de unidades (Unidade, Apartamento, Apto, etc.).
 * - Reconhecer cabeçalhos datados ("Leitura de Set/2026") e legados ("Leitura anterior", etc.).
 * - Extrair mês/ano e calcular score cronológico (ano * 12 + mes).
 * - Selecionar a última leitura válida por unidade (cronológica, com fallback individual).
 * - Preservar o valor zero (0) como válido, sem converter vazios/inválidos em zero.
 * - Usar exclusivamente parseLeituraNumerica como conversor canônico.
 *
 * Não acessa DOM, localStorage, Supabase ou bibliotecas de interface.
 */

/**
 * Mapeamento dos meses para cálculo cronológico.
 */
const MESES = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/**
 * Extrai dados cronológicos ({ ano, mes, score }) de um cabeçalho datado.
 * Suporta formatos:
 * - "Leitura de Ago/2026", "Leitura de Setembro/2026", "Leitura de 08/2026"
 * - "Leitura Ago/2026", "Leitura 08/2026", "Leitura Ago-2026"
 * @param {string} str - Cabeçalho
 * @returns {{ ano: number, mes: number, score: number } | null}
 */
export const extrairDataColunaLeitura = (str) => {
  const norm = normalizarTexto(str);
  if (!norm || !norm.startsWith('leitura')) return null;

  // Rejeita aliases inequívocos de outros tipos de coluna
  if (
    norm.includes('anterior') ||
    norm.includes('fechamento') ||
    norm.includes('atual') ||
    norm.includes('consumo') ||
    norm.includes('valor')
  ) {
    return null;
  }

  let parte = norm.replace(/^leitura\s+de\s+/, '').replace(/^leitura\s+/, '').trim();

  // Formato textual: ago/2026, agosto/2026, ago-2026, ago 2026
  const matchNome = parte.match(/^([a-z]{3,})[\s\/\-](\d{2,4})$/);
  if (matchNome) {
    const mesAbrev = matchNome[1].substring(0, 3);
    const mesNum = MESES[mesAbrev];
    if (!mesNum) return null;
    let ano = parseInt(matchNome[2], 10);
    if (ano < 100) ano += 2000;
    return { ano, mes: mesNum, score: ano * 12 + mesNum };
  }

  // Formato numérico: 08/2026, 08-2026, 08 2026
  const matchNum = parte.match(/^(\d{1,2})[\s\/\-](\d{2,4})$/);
  if (matchNum) {
    const mes = parseInt(matchNum[1], 10);
    let ano = parseInt(matchNum[2], 10);
    if (ano < 100) ano += 2000;
    if (mes < 1 || mes > 12) return null;
    return { ano, mes, score: ano * 12 + mes };
  }

  return null;
};

/**
 * Determina se o cabeçalho indica uma coluna de unidade.
 * @param {string} str
 * @returns {boolean}
 */
export const ehColunaUnidade = (str) => {
  const norm = normalizarTexto(str);
  if (!norm) return false;
  if (norm.includes('unidade')) return true;
  if (norm.includes('apartamento')) return true;
  if (norm.includes('apto')) return true;
  if (norm === 'ap' || norm === 'ap.' || norm === 'ap ') return true;
  if (norm === 'unid') return true;
  if (norm === 'numero' || norm === 'numero apto' || norm === 'numero do apto') return true;
  if (norm === 'identificador') return true;
  if (norm === 'n apto' || norm === 'no apto' || norm === 'no apartamento') return true;
  return false;
};

/**
 * Determina se o cabeçalho corresponde a um formato legado de leitura anterior sem data.
 * @param {string} str
 * @returns {boolean}
 */
export const ehColunaLeituraAnterior = (str) => {
  const norm = normalizarTexto(str);
  if (!norm) return false;
  if (norm.includes('anterior') || norm.includes('ant.')) return true;
  if (norm.startsWith('leitura ant')) return true;
  if (norm.includes('fechamento')) return true;
  if (norm === 'medicao anterior' || norm === 'medicao ant') return true;
  if (norm === 'leitura') return true;
  return false;
};

/**
 * Extrai pares { unidade, leituraAnterior } a partir da matriz de dados bruta da planilha (rawData).
 *
 * Algoritmo por unidade:
 * 1. Mapeia colunas de leitura datadas ordenadas da mais recente para a mais antiga (maior score).
 * 2. Para cada linha (unidade):
 *    - Varre as colunas datadas em ordem decrescente de data;
 *    - A primeira coluna com valor numérico finito válido (incluindo zero) é selecionada;
 *    - Se Set/2026 estiver vazio para AP-101 e Ago/2026 preenchido, usa Ago/2026 para AP-101;
 *    - Se Set/2026 estiver preenchido para AP-102, usa Set/2026 para AP-102;
 * 3. Se nenhuma coluna datada contiver valor para a unidade, aplica colunas legadas de leitura anterior;
 * 4. Se ainda assim não houver valor, retorna leituraAnterior: null.
 *
 * @param {Array<Array<any>>} rawData
 * @returns {Array<{ unidade: string, leituraAnterior: number|null }>}
 */
export const extrairUnidadesELeiturasFromRaw = (rawData) => {
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    throw new Error('A planilha selecionada está vazia.');
  }

  let headerIndex = -1;
  let columnUnidadeIndex = -1;
  const colunasDatadas = [];
  let legacyAnteriorIdx = -1;
  let legacyGenericaIdx = -1;
  let legacyAtualIdx = -1;

  // 1. Localização do cabeçalho nas primeiras 25 linhas
  for (let i = 0; i < Math.min(25, rawData.length); i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;

    let unidadeFound = -1;
    let anteriorFound = -1;
    let genericaFound = -1;
    let atualFound = -1;
    const datadasLinha = [];

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell === null || cell === undefined) continue;
      const str = String(cell).trim();
      if (!str) continue;

      if (unidadeFound === -1 && ehColunaUnidade(str)) {
        unidadeFound = c;
        continue;
      }

      const norm = normalizarTexto(str);
      if (norm === 'leitura atual' || norm === 'atual' || norm.startsWith('leitura atual')) {
        atualFound = c;
        continue;
      }

      const dataCol = extrairDataColunaLeitura(str);
      if (dataCol) {
        datadasLinha.push({ idx: c, ...dataCol, nomeOriginal: str });
        continue;
      }

      if (anteriorFound === -1 && ehColunaLeituraAnterior(str) && norm !== 'leitura') {
        anteriorFound = c;
        continue;
      }

      if (norm === 'leitura') {
        genericaFound = c;
      }
    }

    if (unidadeFound !== -1) {
      headerIndex = i;
      columnUnidadeIndex = unidadeFound;
      legacyAnteriorIdx = anteriorFound;
      legacyGenericaIdx = genericaFound;
      legacyAtualIdx = atualFound;
      colunasDatadas.push(...datadasLinha);
      break;
    }
  }

  // Ordena as colunas datadas rigorosamente da mais recente para a mais antiga
  colunasDatadas.sort((a, b) => b.score - a.score);

  const pares = [];

  if (headerIndex !== -1 && columnUnidadeIndex !== -1) {
    for (let i = headerIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;
      const cellVal = row[columnUnidadeIndex];
      if (cellVal === undefined || cellVal === null) continue;
      const nomeUnidade = String(cellVal).trim();
      if (!nomeUnidade || normalizarTexto(nomeUnidade).includes('total') || normalizarTexto(nomeUnidade).includes('legenda')) {
        continue;
      }

      let leituraEncontrada = null;

      // 1. Tenta a coluna datada mais recente preenchida especificamente para ESTA unidade
      // Ignora zeros que representam meses não preenchidos e busca a última leitura positiva
      for (const col of colunasDatadas) {
        const cell = row[col.idx];
        const num = parseLeituraNumerica(cell);
        if (num !== null && num > 0) {
          leituraEncontrada = num;
          break;
        }
      }

      // 2. Fallback para cabeçalho legado de anterior
      if (leituraEncontrada === null && legacyAnteriorIdx !== -1) {
        const num = parseLeituraNumerica(row[legacyAnteriorIdx]);
        if (num !== null && num > 0) leituraEncontrada = num;
      }

      // 3. Fallback para "Leitura" genérica (quando não há "Leitura Atual")
      if (leituraEncontrada === null && legacyGenericaIdx !== -1 && legacyAtualIdx === -1) {
        const num = parseLeituraNumerica(row[legacyGenericaIdx]);
        if (num !== null && num > 0) leituraEncontrada = num;
      }

      pares.push({ unidade: nomeUnidade, leituraAnterior: leituraEncontrada });
    }
  }

  // Fallback para varredura por padrões se não encontrou cabeçalho padrão
  if (pares.length === 0) {
    rawData.forEach((row, rIdx) => {
      if (rIdx < 2 && rawData.length > 5) return;
      if (Array.isArray(row)) {
        row.forEach(cell => {
          if (cell === null || cell === undefined) return;
          const val = String(cell).trim();
          if (!val) return;
          if (/^[A-Za-z0-9]+[-/][A-Za-z0-9]+$/.test(val) || /^([A-Za-z]+\s*)?\d{2,4}$/i.test(val)) {
            pares.push({ unidade: val, leituraAnterior: null });
          }
        });
      }
    });
  }

  // Deduplicação preservando primeira ocorrência
  const vistas = new Set();
  const paresUnicos = pares.filter(p => {
    const key = String(p.unidade).trim();
    if (vistas.has(key)) return false;
    vistas.add(key);
    return true;
  });

  if (paresUnicos.length === 0) {
    throw new Error(
      'Não foi possível identificar a coluna de unidades da planilha. Verifique se existe uma coluna com cabeçalho Unidade, Apto ou Apartamento.'
    );
  }

  return paresUnicos;
};
