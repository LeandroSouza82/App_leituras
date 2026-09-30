/**
 * ocrService.js — OCR offline via @capacitor-mlkit/text-recognition
 *
 * Responsabilidades:
 *   1. Chamar o motor ML Kit com a imagem (base64 ou URI).
 *   2. Interpretar o resultado bruto e extrair a leitura do medidor.
 *   3. Retornar um resultado tipado, sem efeitos colaterais.
 *
 * Limitações documentadas:
 *   - Dígitos em transição (ex: 3→4 virando): o ML Kit genérico não
 *     detecta transição mecânica com confiança. Quando ambíguo, o
 *     campo permanece editável e o leiturista confirma manualmente.
 *   - O modelo latino está incluído no APK (sem download).
 *   - Esta camada não toca em estado React nem em localStorage.
 */

import { Capacitor } from '@capacitor/core';

// Importação dinâmica segura — o plugin existe apenas em contexto nativo.
// Em ambiente web/testes, o objeto é mock automaticamente (ver abaixo).
let TextRecognition;

const carregarPlugin = async () => {
  if (TextRecognition) return TextRecognition;

  if (!Capacitor.isNativePlatform()) {
    // Ambiente web/testes: retorna stub que falha silenciosamente
    TextRecognition = null;
    return null;
  }

  try {
    const mod = await import('@capacitor-mlkit/text-recognition');
    TextRecognition = mod.TextRecognition;
    return TextRecognition;
  } catch {
    TextRecognition = null;
    return null;
  }
};

/**
 * Salva uma imagem base64 em arquivo temporário para o ML Kit processar.
 * O ML Kit Android exige um caminho de arquivo, não aceita base64 direto.
 *
 * Retorna o URI do arquivo ou null em caso de falha.
 * @param {string} base64DataUrl - "data:image/jpeg;base64,..."
 */
const salvarImagemTemporaria = async (base64DataUrl) => {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const base64 = base64DataUrl.startsWith('data:')
      ? base64DataUrl.split(',')[1]
      : base64DataUrl;

    const nomeArquivo = `ocr_temp_${Date.now()}.jpg`;

    await Filesystem.writeFile({
      path: nomeArquivo,
      data: base64,
      directory: Directory.Cache,
    });

    const uriResult = await Filesystem.getUri({
      path: nomeArquivo,
      directory: Directory.Cache,
    });

    return { uri: uriResult.uri, nomeArquivo };
  } catch {
    return null;
  }
};

/**
 * Remove o arquivo temporário criado para o OCR.
 * Falha silenciosamente — não bloqueia nenhum fluxo.
 */
const limparImagemTemporaria = async (nomeArquivo) => {
  if (!nomeArquivo) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({
      path: nomeArquivo,
      directory: Directory.Cache,
    });
  } catch {
    // Ignora
  }
};

/**
 * Interpreta o texto bruto retornado pelo ML Kit e tenta extrair
 * o valor de leitura do medidor (contador principal).
 *
 * Estratégia:
 *   1. Coleta todos os blocos de texto.
 *   2. Extrai sequências numéricas com possível vírgula/ponto decimal.
 *   3. Prioriza sequências que pareçam um visor de medidor:
 *      - 4 a 10 dígitos totais
 *      - Número isolado em linha própria (típico de contador)
 *   4. Descarta números claramente incompatíveis (muito curtos, datas, seriais).
 *
 * Limitação documentada: dígitos em transição mecânica não são detectados.
 * Retorna null quando não encontra sequência confiável.
 *
 * @param {string} textoCompleto - texto bruto do ML Kit
 * @returns {{ valor: string | null, confianca: 'alta' | 'baixa' | null }}
 */
export const interpretarTextoMedidor = (textoCompleto) => {
  if (!textoCompleto || typeof textoCompleto !== 'string') {
    return { valor: null, confianca: null };
  }

  // Normaliza: remove artefatos OCR comuns (letras O→0, I→1, l→1)
  // mas SÓ dentro de sequências numéricas candidatas
  const normalizarCaracteres = (s) =>
    s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');

  // Quebra por linhas para analisar individualmente
  const linhas = textoCompleto
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const candidatos = [];

  for (const linha of linhas) {
    // Extrai sequências numéricas com separadores decimais opcionais
    // Aceita: "13,5950", "459.0320", "0013595", "13595,0"
    // Rejeita: sequências com mais de 1 separador que pareçam datas ou códigos
    const matches = linha.matchAll(
      /\b(\d{1,6}(?:[.,]\d{1,6})?(?:[.,]\d{1,4})?)\b/g
    );

    for (const m of matches) {
      const raw = m[1];
      const normalizado = normalizarCaracteres(raw);

      // Conta dígitos totais (sem separadores)
      const digitos = normalizado.replace(/[.,]/g, '').length;

      // Filtros básicos:
      // - mínimo 4 dígitos (leitura de medidor raramente tem menos)
      // - máximo 10 dígitos
      // - não começa com 0 e tem mais de 6 dígitos (suspeito de serial)
      if (digitos < 4 || digitos > 10) continue;
      if (/^0\d{6,}/.test(normalizado.replace(/[.,]/g, ''))) continue;

      // Descarta padrões típicos de data: DD/MM, MM/YYYY, etc.
      // (Já filtrados pois usamos apenas dígitos com vírgulas/pontos)

      // Pontuação de confiança: mais dígitos + linha com texto mínimo extra = melhor
      const outrosCaracteres = linha.replace(/[\d.,\s]/g, '').length;
      const pontuacao =
        digitos +
        (outrosCaracteres === 0 ? 3 : 0) + // linha só com número
        (outrosCaracteres <= 5 ? 1 : 0);   // poucos extras

      candidatos.push({ raw: normalizado, digitos, pontuacao, linha });
    }
  }

  if (candidatos.length === 0) {
    return { valor: null, confianca: null };
  }

  // Ordena por pontuação decrescente
  candidatos.sort((a, b) => b.pontuacao - a.pontuacao);

  const melhor = candidatos[0];

  // Confiança baixa: ambiguidade (múltiplos candidatos com pontuação igual)
  const empate =
    candidatos.length > 1 &&
    candidatos[1].pontuacao === melhor.pontuacao;

  if (empate) {
    return { valor: null, confianca: 'baixa' };
  }

  return {
    valor: melhor.raw,
    confianca: melhor.pontuacao >= 6 ? 'alta' : 'baixa',
  };
};

/**
 * Executa o OCR na imagem fornecida.
 *
 * @param {string} imageDataUrl - "data:image/jpeg;base64,..."
 * @param {{ condominioId: string, unidadeId: string, servico: string, captureId: string }} contexto
 *   Contexto de isolamento: permite descartar resultado se contexto mudar.
 *
 * @returns {Promise<{
 *   sucesso: boolean,
 *   valor: string | null,
 *   confianca: 'alta' | 'baixa' | null,
 *   erro: string | null,
 *   contexto: object
 * }>}
 */
export const executarOcr = async (imageDataUrl, contexto) => {
  const resultado = {
    sucesso: false,
    valor: null,
    confianca: null,
    erro: null,
    contexto,
  };

  if (!imageDataUrl) {
    resultado.erro = 'Imagem ausente.';
    return resultado;
  }

  const plugin = await carregarPlugin();

  if (!plugin) {
    resultado.erro = 'OCR não disponível neste ambiente.';
    return resultado;
  }

  let nomeArquivoTemp = null;

  try {
    // 1. Salva imagem em arquivo temporário (ML Kit exige caminho)
    const temp = await salvarImagemTemporaria(imageDataUrl);
    if (!temp) {
      resultado.erro = 'Não foi possível preparar a imagem para reconhecimento.';
      return resultado;
    }
    nomeArquivoTemp = temp.nomeArquivo;

    // 2. Chama o ML Kit
    const tsInicio = Date.now();
    const ocrResult = await plugin.processImage({ path: temp.uri });
    const duracao = Date.now() - tsInicio;

    // Log de performance sem dados sensíveis
    // eslint-disable-next-line no-console
    console.debug(`[OCR] Tempo de reconhecimento: ${duracao}ms`);

    // 3. Extrai texto completo do resultado hierárquico
    // O plugin retorna: { blocks: [{ lines: [{ elements: [{ text }] }] }] }
    let textoCompleto = '';

    if (ocrResult?.blocks) {
      for (const bloco of ocrResult.blocks) {
        for (const linha of bloco.lines || []) {
          const textoLinha = (linha.elements || [])
            .map((el) => el.text || '')
            .join(' ')
            .trim();
          if (textoLinha) {
            textoCompleto += textoLinha + '\n';
          }
        }
      }
    } else if (typeof ocrResult?.text === 'string') {
      // Fallback: versões antigas do plugin retornam texto plano
      textoCompleto = ocrResult.text;
    }

    // 4. Interpreta o texto
    const interpretacao = interpretarTextoMedidor(textoCompleto);

    resultado.sucesso = true;
    resultado.valor = interpretacao.valor;
    resultado.confianca = interpretacao.confianca;
  } catch (err) {
    const msg = err?.message || 'Erro desconhecido no OCR.';
    resultado.erro = msg;
  } finally {
    // 5. Limpeza da imagem temporária (sempre, mesmo em erro)
    await limparImagemTemporaria(nomeArquivoTemp);
  }

  return resultado;
};
