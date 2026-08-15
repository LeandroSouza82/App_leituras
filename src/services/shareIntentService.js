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

        // Processa o arquivo recebido
        const savedFile = await this.handleIncomingFile(fileUri);

        if (savedFile && onFileReceived) {
          onFileReceived(savedFile);
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
      // 1. Garante que a pasta de destino existe
      const targetDir = 'planilhas_recebidas';
      try {
        await Filesystem.mkdir({
          path: targetDir,
          directory: Directory.Data,
          recursive: true
        });
      } catch (e) {
        // Ignora se a pasta já existir
      }

      // 2. Extrai o nome original do arquivo do URI ou gera um timestamp
      const fileName = `import_${new Date().getTime()}.xlsx`; // Fallback
      // Em implementações reais, pode-se usar plugins para obter o nome original via content resolver

      // 3. Copia o arquivo usando a API do Filesystem
      // Nota: O Filesystem.copy do Capacitor v6 suporta cópia direta de content:// URIs no Android
      const result = await Filesystem.copy({
        from: uri,
        to: `${targetDir}/${fileName}`,
        toDirectory: Directory.Data
      });

      console.log('[ShareIntent] Arquivo salvo localmente:', result.uri);

      return {
        name: fileName,
        uri: result.uri,
        path: `${targetDir}/${fileName}`,
        originalUri: uri
      };
    } catch (error) {
      console.error('[ShareIntent] Erro ao copiar arquivo:', error);
      throw error;
    }
  }
};
