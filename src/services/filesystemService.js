import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

/**
 * Serviço Utilitário Modular para operações seguras no Filesystem.
 */

/**
 * Salva um arquivo de forma segura, garantindo diretórios e codificação correta.
 * @param {string} pathCompleto - O caminho completo incluindo o nome do arquivo.
 * @param {string|object} dados - Conteúdo a ser gravado (String ou Objeto).
 * @param {string} [encoding] - Codificação opcional (padrão Encoding.UTF8 para JSON/texto).
 * @returns {Promise<boolean>} Retorna true se salvo com sucesso.
 */
export async function salvarArquivoSeguro(pathCompleto, dados, encoding = null) {
  try {
    // 1. Limpa o path (remove barra inicial se existir para não dar erro)
    const pathLimpo = pathCompleto.startsWith('/') ? pathCompleto.substring(1) : pathCompleto;

    // 2. Extrai apenas o diretório pai (remove o nome do arquivo)
    const partes = pathLimpo.split('/');
    partes.pop(); // Remove o nome do arquivo (ex: unidades.json)
    const caminhoDaPasta = partes.join('/');

    console.log("[FileSystem] Preparando diretório:", caminhoDaPasta);

    // 3. Cria a pasta pai garantidamente
    if (caminhoDaPasta) {
      await Filesystem.mkdir({
        path: caminhoDaPasta,
        directory: Directory.Data,
        recursive: true
      }).catch(() => {
        // Ignora se a pasta já existir
      });
    }

    // 4. Garante que os dados sejam uma string válida
    let dadosParaGravar = dados;
    if (typeof dados === 'object' && dados !== null) {
      dadosParaGravar = JSON.stringify(dados);
    } else if (typeof dados !== 'string') {
      dadosParaGravar = String(dados ?? '');
    }

    // 5. Configuração do encoding para evitar erro de Base64 inválido
    let finalEncoding = encoding;
    if (!finalEncoding) {
      if (pathLimpo.endsWith('.json') || pathLimpo.endsWith('.txt') || typeof dados === 'object') {
        finalEncoding = Encoding.UTF8;
      }
    }

    const writeOptions = {
      path: pathLimpo,
      data: dadosParaGravar,
      directory: Directory.Data,
      recursive: true
    };

    if (finalEncoding) {
      writeOptions.encoding = finalEncoding;
    }

    // 6. Salva o arquivo com recursive: true
    await Filesystem.writeFile(writeOptions);

    console.log("[FileSystem] Arquivo salvo com sucesso em:", pathLimpo);
    return true;

  } catch (err) {
    console.error("[FileSystem] ERRO CRÍTICO AO SALVAR ARQUIVO:", err);
    throw err; // Repassa o erro para o UI mostrar a mensagem
  }
}

/**
 * Lê um arquivo do armazenamento seguro (Directory.Data) com suporte a UTF-8.
 * @param {string} pathCompleto - Caminho relativo do arquivo.
 * @param {string} [encoding] - Codificação opcional (padrão Encoding.UTF8 para JSON/texto).
 * @returns {Promise<string>} Conteúdo lido do arquivo.
 */
export async function lerArquivoSeguro(pathCompleto, encoding = null) {
  try {
    const pathLimpo = pathCompleto.startsWith('/') ? pathCompleto.substring(1) : pathCompleto;

    let finalEncoding = encoding;
    if (!finalEncoding && (pathLimpo.endsWith('.json') || pathLimpo.endsWith('.txt'))) {
      finalEncoding = Encoding.UTF8;
    }

    const readOptions = {
      path: pathLimpo,
      directory: Directory.Data
    };

    if (finalEncoding) {
      readOptions.encoding = finalEncoding;
    }

    const result = await Filesystem.readFile(readOptions);
    return result.data;
  } catch (err) {
    console.error("[FileSystem] ERRO AO LER ARQUIVO:", err);
    throw err;
  }
}
