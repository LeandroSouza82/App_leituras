import { App } from '@capacitor/app';
import { Filesystem } from '@capacitor/filesystem';

let listenerHandle = null;
let listenerGeneration = 0;

/**
 * Serviço Sênior para interceptar arquivos compartilhados via Intent do Android.
 * Suporta a captura de planilhas .xlsx, .xls e .csv.
 */
export const ShareIntentService = {
  /**
   * Inicializa o listener para capturar arquivos quando o app é aberto por um Intent externo.
   * @param {Function} onFileReceived - Callback executado quando um arquivo é processado.
   */
  async init(onFileReceived) {
    const generation = ++listenerGeneration;

    if (listenerHandle) {
      await listenerHandle.remove();
      listenerHandle = null;
    }

    // Listener para o evento de abertura via URL/File URI
    const handle = await App.addListener('appUrlOpen', async (data) => {

      try {
        const fileUri = data.url;

        // Valida se o URI é de um arquivo (content:// ou file://)
        if (!fileUri.startsWith('content://') && !fileUri.startsWith('file://')) {
          return;
        }

        let arrayBuffer;
        try {
          // Tenta buscar o arquivo via fetch (muito comum em Intents do Android)
          const response = await fetch(fileUri);
          const blob = await response.blob();
          arrayBuffer = await blob.arrayBuffer();
        } catch (e) {
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
      }
    });

    if (generation !== listenerGeneration) {
      await handle.remove();
      return null;
    }

    listenerHandle = handle;
    return handle;
  },

  async stop() {
    listenerGeneration += 1;
    const handle = listenerHandle;
    listenerHandle = null;
    if (handle) await handle.remove();
  },
};
