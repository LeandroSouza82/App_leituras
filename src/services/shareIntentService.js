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
  async init(onFileReceived, onError) {
    const generation = ++listenerGeneration;

    if (listenerHandle) {
      await listenerHandle.remove();
      listenerHandle = null;
    }

    // Cada entrega nativa tem URI própria; evita duplicação entre evento e abertura inicial.
    const entregas = new Set();
    const receberArquivo = async (data) => {
      const fileUri = data?.url;
      if (typeof fileUri !== 'string' ||
          (!fileUri.startsWith('content://') && !fileUri.startsWith('file://'))) return;
      if (generation !== listenerGeneration || entregas.has(fileUri)) return;
      entregas.add(fileUri);

      try {
        // No Android, a leitura nativa respeita o ContentResolver e dispensa fetch(file://).
        const resultado = await Filesystem.readFile({ path: fileUri });
        if (typeof resultado?.data !== 'string' || !resultado.data) {
          throw new Error('O arquivo recebido está vazio ou indisponível.');
        }
        const fileName = decodeURIComponent(fileUri.substring(fileUri.lastIndexOf('/') + 1).split('?')[0]);
        if (generation !== listenerGeneration) return;
        await onFileReceived?.({
          name: fileName || `shared_${Date.now()}.xlsx`,
          data: 'data:application/octet-stream;base64,' + resultado.data,
          originalUri: fileUri,
        });
      } catch (error) {
        entregas.delete(fileUri);
        console.warn('[ShareIntentService] Falha ao receber planilha:', error);
        if (generation === listenerGeneration) await onError?.(error);
      }
    };
    const handle = await App.addListener('appUrlOpen', receberArquivo);

    if (generation !== listenerGeneration) {
      await handle.remove();
      return null;
    }

    listenerHandle = handle;
    try {
      // Recupera também o arquivo que abriu o app antes da montagem da tela autenticada.
      await receberArquivo(await App.getLaunchUrl());
    } catch (error) {
      console.warn('[ShareIntentService] Falha ao consultar abertura inicial:', error);
      if (generation === listenerGeneration) await onError?.(error);
    }
    return handle;
  },

  async stop() {
    listenerGeneration += 1;
    const handle = listenerHandle;
    listenerHandle = null;
    if (handle) await handle.remove();
  },
};
