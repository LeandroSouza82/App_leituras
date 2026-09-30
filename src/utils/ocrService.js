/**
 * ocrService.js — OCR offline via @capacitor-mlkit/text-recognition
 *
 * Responsabilidades:
 *   1. Chamar o motor ML Kit com a imagem (base64 ou URI).
 *   2. Interpretar o resultado bruto e extrair a leitura do medidor.
 *   3. Limpar o arquivo temporário e devolver uma sugestão sem salvar a leitura.
 *
 * Limitações documentadas:
 *   - Dígitos em transição (ex: 3→4 virando): o ML Kit genérico não
 *     detecta transição mecânica com confiança. Quando ambíguo, o
 *     campo permanece editável e o leiturista confirma manualmente.
 *   - O modelo latino está incluído no APK (sem download).
 *   - Esta camada não toca em estado React nem em localStorage.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Importação dinâmica segura — o plugin existe apenas em contexto nativo.
// O motor é carregado somente na primeira execução nativa.
let TextRecognition;

const carregarPlugin = async () => {
  if (TextRecognition) return TextRecognition;

  if (!Capacitor.isNativePlatform()) {
    // Reconhecimento indisponível no navegador.
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
    const base64 = base64DataUrl.startsWith('data:')
      ? base64DataUrl.split(',')[1]
      : base64DataUrl;

    const nomeArquivo = `ocr_temp_${globalThis.crypto.randomUUID()}.jpg`;

    const arquivo = await Filesystem.writeFile({
      path: nomeArquivo,
      data: base64,
      directory: Directory.Cache,
    });

    return { uri: arquivo.uri, nomeArquivo };
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
    await Filesystem.deleteFile({
      path: nomeArquivo,
      directory: Directory.Cache,
    });
  } catch {
    // Ignora
  }
};

/**
 * Seleção conservadora, não é uma medida de confiança do ML Kit.
 * Sem separador explícito não há evidência da posição decimal.
 * Não seleciona por comprimento nem transforma letras em números.
 */
export const interpretarTextoMedidor = (texto) => {
  const vazio = { valor: null };
  if (typeof texto !== 'string' || !texto.trim()) return vazio;
  const candidatos = [];
  for (const linha of texto.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)) {
    // Consome tokens completos para não extrair fragmentos de datas/seriais.
    const tokens = linha.match(/[\p{L}\p{N}.,/:-]+/gu) || [];
    for (const token of tokens) {
      if (!/\d/.test(token) || /^(?:m3|m³)$/i.test(token)) continue;
      const visor = linha.match(/^(\d{1,6}[.,]\d{1,4})\s*(?:m³|m3|kWh)?$/i);
      if (!visor || token !== visor[1]) return vazio;
      candidatos.push(visor[1]);
    }
  }
  return candidatos.length === 1 ? { valor: candidatos[0] } : vazio;
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
 *   erro: string | null,
 *   contexto: object
 * }>}
 */
export const executarOcr = async (imageDataUrl, contexto) => {
  const resultado = {
    sucesso: false,
    valor: null,
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

    const textoCompleto = ocrResult?.text || '';

    // 4. Interpreta o texto
    const interpretacao = interpretarTextoMedidor(textoCompleto);

    resultado.sucesso = true;
    resultado.valor = interpretacao.valor;
  } catch (err) {
    resultado.erro = 'Não foi possível reconhecer a imagem.';
  } finally {
    // 5. Limpeza da imagem temporária (sempre, mesmo em erro)
    await limparImagemTemporaria(nomeArquivoTemp);
  }

  return resultado;
};
