import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * Serviço Sênior para interceptar arquivos compartilhados via Intent do Android.
 * Suporta a captura de planilhas .xlsx, .xls e .csv.
 */
export const ShareIntentService = {
  /**
   * Inicializa o listener para capturar arquivos quando o app é aberto por um Intent externo.
   * @param {Function} onFileReceived - Callback executado quando um arquivo é processado.
   */
  init(onFileReceived) {
    // Listener para o evento de abertura via URL/File URI
    App.addListener('appUrlOpen', async (data) => {
      console.log('[ShareIntent] Recebido evento appUrlOpen:', data.url);

      try {
        const fileUri = data.url;

        // Valida se o URI é de um arquivo (content:// ou file://)
        if (!fileUri.startsWith('content://') && !fileUri.startsWith('file://')) {
          console.warn('[ShareIntent] URL recebida não é um arquivo válido:', fileUri);
          return;
        }

        let arrayBuffer;
        try {
          // Tenta buscar o arquivo via fetch (muito comum em Intents do Android)
          const response = await fetch(fileUri);
          const blob = await response.blob();
          arrayBuffer = await blob.arrayBuffer();
        } catch (e) {
          console.error("Erro no fetch da URI, tentando Filesystem...", e);
          // Fallback usando o Filesystem do Capacitor se necessário
          const readFileResult = await Filesystem.readFile({ path: fileUri });
          if (readFileResult && readFileResult.data) {
            arrayBuffer = 'data:application/octet-stream;base64,' + readFileResult.data;
          }
        }

        let fileName = fileUri.substring(fileUri.lastIndexOf('/') + 1) || `shared_${Date.now()}.xlsx`;
        fileName = decodeURIComponent(fileName.split('?')[0]);

        if (arrayBuffer && onFileReceived) {
          onFileReceived({
            name: fileName,
            data: arrayBuffer,
            originalUri: fileUri
          });
        }
      } catch (error) {
        console.error('[ShareIntent] Falha ao processar arquivo compartilhado:', error);
      }
    });
  },

  /**
   * Processa o URI do arquivo, copia para a pasta interna do app e retorna os metadados.
   */
  async handleIncomingFile(uri) {
    try {
      // 1. Tenta ler o arquivo diretamente pelo caminho da URI (file:// ou path absoluto)
      let fileData = null;
      try {
        const readDirect = await Filesystem.readFile({ path: uri });
        if (readDirect && readDirect.data) {
          fileData = readDirect.data;
        }
      } catch (_) {}

      // 2. Garante que a pasta de destino existe
      const targetDir = 'planilhas_recebidas';
      try {
        await Filesystem.mkdir({
          path: targetDir,
          directory: Directory.Data,
          recursive: true
        });
      } catch (ignored) {}

      // 3. Extrai o nome do arquivo do URI ou gera um timestamp
      let fileName = uri.substring(uri.lastIndexOf('/') + 1) || `shared_${Date.now()}.xlsx`;
      fileName = decodeURIComponent(fileName.split('?')[0]);
      if (!fileName.toLowerCase().endsWith('.xlsx') && !fileName.toLowerCase().endsWith('.xls') && !fileName.toLowerCase().endsWith('.csv')) {
        fileName += '.xlsx';
      }

      const targetPath = `${targetDir}/${fileName}`;

      // Se temos os dados diretos, salva no Directory.Data
      if (fileData) {
        await Filesystem.writeFile({
          path: targetPath,
          data: fileData,
          directory: Directory.Data
        });
      } else {
        // Copia usando copy
        await Filesystem.copy({
          from: uri,
          to: targetPath,
          toDirectory: Directory.Data
        });
      }

      console.log('[ShareIntent] Arquivo processado com sucesso em:', targetPath);

      return {
        name: fileName,
        path: targetPath,
        originalUri: uri
      };
    } catch (error) {
      console.error('[ShareIntent] Erro ao copiar arquivo:', error);
      throw error;
    }
  }
};
