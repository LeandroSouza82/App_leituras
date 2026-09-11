/**
 * Módulo puro responsável pela extração e validação de metadados de planilhas uCondo.
 *
 * Responsabilidades:
 * - Normalização textual para metadados e correspondência de nomes.
 * - Cálculo de similaridade (Levenshtein) para associação de condomínios.
 * - Identificação estrita do serviço (AGUA, GAS, ENERGIA ou null para ambíguo).
 * - Extração de metadados das células do cabeçalho da planilha (Nome e Serviço).
 *
 * Não acessa DOM, localStorage, Supabase ou bibliotecas de interface.
 */

/**
 * Normaliza strings para comparação (remove acentos, caixa baixa, trim).
 * @param {string} txt
 * @returns {string}
 */
export const normalizarTexto = (txt) => {
  if (!txt) return '';
  return String(txt)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * Normaliza o nome do condomínio para correspondência precisa.
 * @param {string} txt
 * @returns {string}
 */
export const normalizarNome = (txt) => {
  if (!txt) return '';
  return String(txt)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
};

/**
 * Calcula a distância de Levenshtein entre duas strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export const calcularDistanciaLevenstein = (a, b) => {
  if (!a || !a.length) return (b || '').length;
  if (!b || !b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

/**
 * Identificação segura do serviço a partir de texto (ex: célula "Consumo de: ...").
 *
 * Regras estritas:
 * - Água explícita (sem gás) -> 'AGUA'
 * - Gás explícito (sem água) -> 'GAS'
 * - Energia explícita -> 'ENERGIA'
 * - "Água e Gás", ausente, vazio ou ambíguo -> null (NUNCA assume AGUA ou GAS silenciosamente)
 *
 * @param {string} tipoBruto
 * @returns {'AGUA'|'GAS'|'ENERGIA'|null}
 */
export const extrairServicoDeTexto = (tipoBruto) => {
  if (!tipoBruto) return null;
  const t = normalizarTexto(tipoBruto);
  if (!t) return null;

  // Casos ambíguos ou combinados: não assumir silenciosamente
  const temAgua = t.includes('agua');
  const temGas = t.includes('gas');
  const temEnergia = t.includes('energia');

  if (temAgua && temGas) return null; // "Água e Gás" -> ambíguo
  if (temAgua) return 'AGUA';
  if (temGas) return 'GAS';
  if (temEnergia) return 'ENERGIA';

  return null; // desconhecido -> null
};

/**
 * Extrai metadados do cabeçalho da planilha uCondo a partir da matriz de dados (rawData):
 * - Nome do Condomínio
 * - Tipo de medição bruto
 * - Serviço inequívoco ('AGUA' | 'GAS' | 'ENERGIA' | null)
 *
 * Suporta metadados na mesma célula ("Condomínio: São Bento") ou em células adjacentes (A1="Condomínio:", B1="São Bento").
 *
 * @param {Array<Array<any>>} rawData
 * @param {string} [nomeArquivo='']
 * @returns {{ nome: string, tipoMedicao: string, servico: 'AGUA'|'GAS'|'ENERGIA'|null }}
 */
export const extrairMetadadosPlanilha = (rawData, nomeArquivo = '') => {
  let nomeExtraido = '';
  let tipoMedicaoBruto = '';

  if (Array.isArray(rawData)) {
    for (let i = 0; i < Math.min(15, rawData.length); i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      for (let j = 0; j < row.length; j++) {
        const cellValue = normalizarTexto(row[j]);
        if (!cellValue) continue;

        // Busca "Condomínio"
        if (cellValue.includes('condominio')) {
          const partsCond = String(row[j]).split(':');
          if (partsCond.length > 1 && partsCond[1].trim()) {
            nomeExtraido = partsCond[1].replace(/\*/g, '').trim();
          } else {
            for (let k = j + 1; k < Math.min(j + 5, row.length); k++) {
              if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                nomeExtraido = String(row[k]).replace(/\*/g, '').trim();
                break;
              }
            }
          }
        }

        // Busca "Consumo de" / "Tipo de Medição"
        if (
          cellValue.includes('consumo de') ||
          cellValue.includes('tipo de leitura') ||
          cellValue.includes('tipo de medicao')
        ) {
          const parts = String(row[j]).split(':');
          if (parts.length > 1 && parts[1].trim()) {
            tipoMedicaoBruto = parts[1].replace(/\*/g, '').trim();
          } else {
            const limpoMesma = cellValue.replace(/^(consumo\s+de|tipo\s+de\s+(leitura|medicao))[:\s]*/i, '').trim();
            if (limpoMesma) {
              tipoMedicaoBruto = limpoMesma;
            } else {
              for (let k = j + 1; k < Math.min(j + 5, row.length); k++) {
                if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                  tipoMedicaoBruto = String(row[k]).replace(/\*/g, '').trim();
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  const servico = extrairServicoDeTexto(tipoMedicaoBruto);

  return {
    nome: nomeExtraido,
    tipoMedicao: tipoMedicaoBruto,
    servico,
  };
};
