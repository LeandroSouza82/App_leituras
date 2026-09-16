/**
 * zipFotosNaming.js
 * Responsabilidade unica: funcoes puras para geração de nomes e parsing de arquivos de foto.
 * Sem dependencias externas. Testavel isoladamente.
 */

/** Servicos reconhecidos */
const SERVICOS = ['AGUA', 'GAS', 'ENERGIA'];

/**
 * Sanitiza o nome do condominio para uso em nomes de arquivo/pasta.
 * Espacos viram underscores; caracteres especiais sao removidos.
 * @param {string} nome
 * @returns {string}
 */
export const sanitizarNomeCondominio = (nome) => {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
};

/**
 * Gera a competencia no formato MM-AAAA a partir da data local atual.
 * @param {Date} [data] - Opcional; padrao: new Date()
 * @returns {string} ex: "09-2026"
 */
export const gerarCompetenciaMesAno = (data = new Date()) => {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  return `${mes}-${ano}`;
};

/**
 * Gera o nome canonico do ZIP.
 * @param {string} nomeCondominio
 * @param {Date} [data]
 * @returns {string} ex: "Lindolfo_dos_Santos_09-2026.zip"
 */
export const gerarNomeZip = (nomeCondominio, data = new Date()) => {
  const nomeSeguro = sanitizarNomeCondominio(nomeCondominio);
  const competencia = gerarCompetenciaMesAno(data);
  return `${nomeSeguro}_${competencia}.zip`;
};

/**
 * Interpreta o nome fisico de uma foto e retorna os metadados para o ZIP.
 * Exemplos:
 *   AptoA-0101_AGUA.jpg  => { unidade: 'A-0101', servico: 'AGUA', nomeZip: 'A-0101_AGUA.jpg' }
 *   AptoAP-203_GAS.jpg   => { unidade: 'AP-203', servico: 'GAS',  nomeZip: 'AP-203_GAS.jpg'  }
 *   AptoB-0504_ENERGIA.jpg => { unidade: 'B-0504', servico: 'ENERGIA', nomeZip: 'B-0504_ENERGIA.jpg' }
 *
 * @param {string} fileName - Nome fisico do arquivo (ex: "AptoA-0101_AGUA.jpg")
 * @returns {{ unidade: string, servico: string, nomeZip: string } | null}
 *   Retorna null se o arquivo nao puder ser classificado.
 */
export const interpretarNomeFoto = (fileName) => {
  if (!fileName || typeof fileName !== 'string') return null;

  // Extrair extensao real antes de remover (preservada no nomeZip)
  const extMatch = fileName.match(/\.(jpg|jpeg|png)$/i);
  if (!extMatch) return null;
  const extensao = extMatch[1].toLowerCase(); // ex: 'jpg', 'jpeg', 'png'

  // Remove extensao para parsing do padrao [Apto][unidade]_[SERVICO]
  const semExt = fileName.replace(/\.(jpg|jpeg|png)$/i, '');

  // O prefixo "Apto" e opcional para tolerancia
  const match = semExt.match(/^(?:Apto)?(.+)_([A-Z]+)$/i);
  if (!match) return null;

  const unidade = match[1]; // ex: "A-0101"
  const servicoCandidato = match[2].toUpperCase(); // ex: "AGUA"

  if (!SERVICOS.includes(servicoCandidato)) return null;

  return {
    unidade,
    servico: servicoCandidato,
    nomeZip: `${unidade}_${servicoCandidato}.${extensao}`, // extensao real preservada
  };
};
