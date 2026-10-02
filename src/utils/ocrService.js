/**
 * ocrService.js — OCR offline via @capacitor-mlkit/text-recognition
 *
 * Responsabilidades:
 *   1. Chamar o motor ML Kit com a imagem (base64 ou URI).
 *   2. Interpretar o resultado bruto e extrair a leitura do medidor.
 *   3. Limpar o arquivo temporário e devolver uma sugestão sem salvar a leitura.
 *
 * Limitações documentadas:
 *   - Dígitos em transição (ex: 3→4 virando): o ML Kit genérico
 *     pode omitir um dos dígitos. Só trata o próximo quando há um par
 *     consecutivo visualmente alinhado; dúvidas exigem conferência manual.
 *   - O modelo latino está incluído no APK (sem download).
 *   - Esta camada não toca em estado React nem em localStorage.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { TextRecognition } from '@capacitor-mlkit/text-recognition';
import { reconhecerVisorPorCor } from './ocrVisor.js';
import { prepararRecorteVisor, prepararContrasteEnquadrado } from './ocrImagem.js';

/**
 * Salva uma imagem base64 em arquivo temporário para o ML Kit processar.
 * O ML Kit Android exige um caminho de arquivo, não aceita base64 direto.
 *
 * Retorna o URI do arquivo ou null em caso de falha.
 * @param {string} base64DataUrl - "data:image/jpeg;base64,..."
 */
const salvarImagemTemporaria = async (base64DataUrl) => {
  const nomeArquivo = `ocr_temp_${globalThis.crypto.randomUUID()}.jpg`;
  try {
    const base64 = base64DataUrl.startsWith('data:')
      ? base64DataUrl.split(',')[1]
      : base64DataUrl;

    const arquivo = await Filesystem.writeFile({
      path: nomeArquivo,
      data: base64,
      directory: Directory.Cache,
    });

    return { uri: arquivo.uri, nomeArquivo };
  } catch {
    // A escrita nativa pode falhar depois de criar parte do arquivo.
    await limparImagemTemporaria(nomeArquivo);
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
      const visor = linha.match(/^(\d{1,6}[.,]\d{1,4})\s*(?:m(?:³|3)?|kWh)?$/i);
      if (!visor || token !== visor[1]) return vazio;
      candidatos.push(visor[1]);
    }
  }
  return candidatos.length === 1 ? { valor: candidatos[0] } : vazio;
};

const interpretarRespostaOcr = async (imagem, resposta, origem, registrar) => {
  const diagnosticoAtivo = import.meta.env?.VITE_OCR_DIAGNOSTICO === 'true';
  if (diagnosticoAtivo) {
    const linhas = (resposta?.blocks || []).flatMap(b => b.lines || []);
    const trechos = linhas.filter(l => /\d/.test(l.text || '')).slice(0, 8)
      .map(l => `${String(l.text).slice(0, 60)} [${(l.elements || []).map(e => String(e.text).slice(0, 20)).join(' | ')}]`);
    registrar(`${origem} — linhas com números:\n${trechos.join('\n').slice(0, 600) || 'Nenhuma'}`);
  }
  registrar(`Interpretando ${origem.toLowerCase()}`);
  const interpretacao = interpretarTextoMedidor(resposta?.text || '');
  if (interpretacao.valor) registrar(`${origem} — separador explícito: ${interpretacao.valor}`);
  const detalhes = [];
  // A foto pode omitir dígitos. Só permite tratar sufixos verificados pelos
  // símbolos após reconhecer novamente o recorte validado.
  const valor = interpretacao.valor || await reconhecerVisorPorCor(imagem, resposta?.blocks, detalhe => {
    if (diagnosticoAtivo && detalhes.length < 32) detalhes.push(detalhe);
  }, origem === 'Recorte');
  if (diagnosticoAtivo && detalhes.length) registrar(`${origem} — análise das cores:\n${detalhes.join('\n')}`);
  if (valor && !interpretacao.valor) registrar(`${origem} — divisão por cor/posição: ${valor}`);
  return valor;
};

/**
 * Executa o OCR na imagem fornecida.
 *
 * @param {string|object} imagem - DataUrl ou recurso temporário do reconhecimento.
 * @param {{ condominioId: string, unidadeId: string, servico: string, captureId: string }} contexto
 *   Contexto de isolamento: permite descartar resultado se contexto mudar.
 * @param {function(string): void} registrar - Diagnóstico local da sessão.
 * @param {function(): boolean} sessaoAtiva - Impede novas chamadas após cancelamento.
 *
 * @returns {Promise<{
 *   sucesso: boolean,
 *   valor: string | null,
 *   erro: string | null,
 *   contexto: object
 * }>}
 */
export const executarOcr = async (imagem, contexto, registrar = () => {}, sessaoAtiva = () => true) => {
  let imageDataUrl = typeof imagem === 'string' ? imagem : imagem?.ler?.();
  const enquadrada = imagem?.enquadrada === true;
  const resultado = {
    sucesso: false,
    valor: null,
    erro: null,
    contexto,
  };

  registrar('Verificando plugin · D15');
  // Importar o proxy não executa o motor. A chamada permanece só no nativo.
  const plugin = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TextRecognition')
    ? TextRecognition : null;

  const temporarios = [];
  let recorte = null;
  let limpeza = Promise.resolve();
  const limparTodos = () => {
    const arquivos = temporarios.splice(0);
    limpeza = Promise.all([limpeza, ...arquivos.map(limparImagemTemporaria)]);
    return limpeza;
  };
  const desobservar = imagem?.aoLiberar?.(() => {
    // Mesmo se a chamada nativa não responder, cancelar/timeout não conserva
    // o arquivo temporário. Uma resposta posterior continuará descartada.
    imageDataUrl = null;
    recorte = null;
    limparTodos();
  });

  try {
    if (!imageDataUrl) {
      resultado.erro = imagem?.erro || 'Imagem ausente.';
      registrar(resultado.erro);
      return resultado;
    }
    if (!plugin) {
      registrar('Plugin indisponível');
      resultado.erro = 'OCR não disponível neste ambiente.';
      return resultado;
    }
    // 1. Salva imagem em arquivo temporário (ML Kit exige caminho)
    registrar('Preparando arquivo da foto');
    const temp = await salvarImagemTemporaria(imageDataUrl);
    if (!temp) {
      registrar('Falha ao preparar foto');
      resultado.erro = 'Não foi possível preparar a imagem para reconhecimento.';
      return resultado;
    }
    temporarios.push(temp.nomeArquivo);
    if (!sessaoAtiva()) return resultado;

    // 2. Chama o ML Kit
    const tsInicio = Date.now();
    registrar('Aguardando motor ML Kit');
    const ocrResult = await plugin.processImage({ path: temp.uri });
    registrar(ocrResult?.text?.trim() ? 'Motor respondeu com texto' : 'Motor respondeu sem texto');
    const duracao = Date.now() - tsInicio;

    // Log de performance sem dados sensíveis
    // eslint-disable-next-line no-console
    console.debug(`[OCR] Tempo de reconhecimento: ${duracao}ms`);

    if (!sessaoAtiva()) return resultado;
    resultado.sucesso = true;
    registrar(enquadrada ? 'Área delimitada pelo guia' : 'Foto sem guia');
    resultado.valor = await interpretarRespostaOcr(imageDataUrl, ocrResult, enquadrada ? 'Recorte' : 'Foto', registrar);
    // Uma única tentativa adicional, somente num recorte visualmente validado.
    // Edição, fechamento e timeout impedem iniciar outra chamada ao motor.
    if (!resultado.valor && sessaoAtiva()) {
      registrar(enquadrada ? 'Preparando contraste da faixa' : 'Preparando recorte do visor');
      recorte = enquadrada ? await prepararContrasteEnquadrado(imageDataUrl)
        : await prepararRecorteVisor(imageDataUrl, ocrResult?.blocks, detalhe => {
        if (import.meta.env?.VITE_OCR_DIAGNOSTICO === 'true') registrar(detalhe);
      });
      if (recorte && sessaoAtiva()) {
        const tempRecorte = await salvarImagemTemporaria(recorte.contraste);
        if (!tempRecorte) throw new Error('Falha ao preparar recorte');
        temporarios.push(tempRecorte.nomeArquivo);
        if (!sessaoAtiva()) return resultado;
        registrar('Reconhecendo recorte com contraste');
        const respostaRecorte = await plugin.processImage({ path: tempRecorte.uri });
        if (!sessaoAtiva()) return resultado;
        // As cores vêm da cópia colorida, com as mesmas coordenadas do recorte.
        resultado.valor = await interpretarRespostaOcr(recorte.original, respostaRecorte, 'Recorte', registrar);
      }
    }
    registrar(resultado.valor ? 'Sugestão encontrada' : 'Nenhuma sugestão utilizável');
  } catch {
    registrar('Falha no processamento');
    resultado.sucesso = false;
    resultado.valor = null;
    resultado.erro = 'Não foi possível reconhecer a imagem.';
  } finally {
    // Limpeza das duas imagens temporárias, inclusive em caso de erro.
    registrar('Limpando arquivo temporário');
    await limparTodos();
    desobservar?.();
    imagem?.liberar?.();
    imageDataUrl = null;
    recorte = null;
    registrar('Limpeza encerrada');
  }

  return resultado;
};
