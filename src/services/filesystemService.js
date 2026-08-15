import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * Serviço Utilitário Modular para operações seguras no Filesystem.
 */

/**
 * Esta função garante que a pasta existe e salva o arquivo em seguida.
 * @param {string} pathCompleto - O caminho completo incluindo o nome do arquivo.
 * @param {string} dadosBase64 - Os dados do arquivo em formato Base64.
 * @returns {Promise<boolean>} Retorna true se salvo com sucesso.
 */
export async function salvarArquivoSeguro(pathCompleto, dadosBase64) {
  try {
    // 1. Limpa o path (remove barra inicial se existir para não dar erro)
    const pathLimpo = pathCompleto.startsWith('/') ? pathCompleto.substring(1) : pathCompleto;

    // 2. Extrai apenas o diretório pai (remove o nome do arquivo)
    const partes = pathLimpo.split('/');
    partes.pop(); // Remove o nome do arquivo (ex: foto.jpg)
    const caminhoDaPasta = partes.join('/');

    console.log("[FileSystem] Preparando diretório:", caminhoDaPasta);

    // 3. Cria a pasta pai garantidamente
    if (caminhoDaPasta) {
      await Filesystem.mkdir({
        path: caminhoDaPasta,
        directory: Directory.Data,
        recursive: true
      }).catch(() => {
        // Ignora se a pasta já existir (algumas versões do Android podem lançar erro mesmo com recursive: true)
      });
    }

    // 4. Salva o arquivo com recursive: true para garantir proteção extra no diretório pai
    await Filesystem.writeFile({
      path: pathLimpo,
      data: dadosBase64,
      directory: Directory.Data,
      recursive: true // <-- Essencial para evitar o erro no write
    });

    console.log("[FileSystem] Arquivo salvo com sucesso em:", pathLimpo);
    return true;

  } catch (err) {
    console.error("[FileSystem] ERRO CRÍTICO AO SALVAR ARQUIVO:", err);
    throw err; // Repassa o erro para o UI mostrar a mensagem
  }
}
