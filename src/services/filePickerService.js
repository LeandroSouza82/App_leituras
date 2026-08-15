import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { salvarArquivoSeguro } from './filesystemService';

/**
 * Serviço Sênior Modular para seleção e persistência local de arquivos de planilha.
 */
export const FilePickerService = {
  /**
   * Abre o seletor nativo, filtra por planilhas e salva uma cópia localmente.
   * @returns {Promise<Object|null>} Dados do arquivo salvo ou null se cancelado.
   */
  async pickAndSaveSpreadsheet() {
    try {
      // 1. Selecionar o arquivo nativamente
      const result = await FilePicker.pickFiles({
        types: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values'],
        multiple: false,
        readData: true,
      });

      if (!result.files || result.files.length === 0) return null;

      const file = result.files[0];
      const targetDir = 'planilhas_recebidas';

      // 2. Gerar nome seguro e salvar cópia permanentemente usando o serviço seguro
      const safeName = `picked_${new Date().getTime()}_${file.name.replace(/\s+/g, '_')}`;
      const targetPath = `${targetDir}/${safeName}`;

      await salvarArquivoSeguro(targetPath, file.data);

      const uriResult = await Filesystem.getUri({
        path: targetPath,
        directory: Directory.Data
      });

      console.log('[FilePicker] Arquivo persistido em:', uriResult.uri);

      return {
        name: file.name,
        localName: safeName,
        path: targetPath,
        size: file.size,
        mimeType: file.mimeType,
      };
    } catch (error) {
      console.error('[FilePicker] Falha na seleção/salvamento:', error);
      throw error;
    }
  },

  /**
   * Lista todas as planilhas já salvas na pasta interna.
   */
  async getLocalSpreadsheets() {
    try {
      const targetDir = 'planilhas_recebidas';

      // Garante a existência antes de ler
      await Filesystem.mkdir({
        path: targetDir,
        directory: Directory.Data,
        recursive: true,
      }).catch(() => {});

      const { files } = await Filesystem.readdir({
        path: targetDir,
        directory: Directory.Data,
      });

      console.log(`[FilePicker] Varredura em ${targetDir}:`, files);

      return files.map(file => ({
        name: typeof file === 'string' ? file : file.name,
        path: `${targetDir}/${typeof file === 'string' ? file : file.name}`
      }));
    } catch (error) {
      console.error('[FilePicker] Erro na varredura local:', error);
      return [];
    }
  }
};
