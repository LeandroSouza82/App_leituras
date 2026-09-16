/**
 * ordenarUnidades.js
 *
 * Utilitario centralizado de normalizacao e ordenacao natural de unidades.
 * Responsabilidade unica: recebe qualquer lista de unidades (strings ou valores
 * convertiveis) e retorna um array limpo, sem duplicatas e ordenado naturalmente.
 *
 * Usado por:
 *   - LeituraFotoModal  -> listaCompleta, carregarDadosIniciais
 *   - ucondoImportService -> persistirUnidadesLocal
 *
 * NAO importar aqui nenhum servico externo.
 * NAO duplicar esta logica em outros modulos.
 */

/**
 * Normaliza, desduplicata e ordena naturalmente uma lista de identificadores de unidades.
 *
 * Exemplos de saida garantida:
 *   ['A-0704','A-0101'] -> ['A-0101','A-0704']
 *   ['AP-10','AP-2','AP-1'] -> ['AP-1','AP-2','AP-10']
 *
 * @param {Array<any>} lista - Array de strings ou valores convertiveis a string.
 * @returns {Array<string>} Lista normalizada, sem vazios, sem duplicatas, ordenada.
 */
export const ordenarUnidadesNatural = (lista) => {
  if (!Array.isArray(lista)) return [];

  // 1. Converter para string, trim e remover vazios
  const normalizadas = lista
    .map(u => String(u ?? '').trim())
    .filter(Boolean);

  // 2. Remover duplicatas preservando a primeira ocorrencia
  const vistas = new Set();
  const unicas = normalizadas.filter(u => {
    if (vistas.has(u)) return false;
    vistas.add(u);
    return true;
  });

  // 3. Ordenacao natural (alfa-numerica, case-insensitive)
  // localeCompare com numeric:true garante A-2 < A-10 (nao A-10 < A-2)
  return unicas.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
};

/**
 * Normaliza, desduplicata e ordena naturalmente uma lista de PARES {unidade, ...resto}.
 * Mantem a associacao intacta: leitura anterior nunca troca de unidade apos a ordenacao.
 *
 * @param {Array<{unidade: string, [key: string]: any}>} pares
 * @returns {Array<{unidade: string, [key: string]: any}>}
 */
export const ordenarParesNatural = (pares) => {
  if (!Array.isArray(pares)) return [];

  // Desduplicar por unidade (mantem o primeiro encontrado)
  const vistas = new Set();
  const unicos = pares.filter(p => {
    const nome = String(p?.unidade ?? '').trim();
    if (!nome || vistas.has(nome)) return false;
    vistas.add(nome);
    return true;
  });

  return unicos.sort((a, b) =>
    String(a.unidade ?? '').localeCompare(
      String(b.unidade ?? ''),
      undefined,
      { numeric: true, sensitivity: 'base' }
    )
  );
};
