import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem, Directory } from '@capacitor/filesystem';

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

      // 2. Garantir que a pasta interna existe
      try {
        await Filesystem.mkdir({
          path: targetDir,
          directory: Directory.Data,
          recursive: true,
        });
      } catch (e) {
        // Ignora se já existir
      }

      // 3. Gerar nome seguro e salvar cópia
      const safeName = `${new Date().getTime()}_${file.name.replace(/\s+/g, '_')}`;
      const targetPath = `${targetDir}/${safeName}`;

      await Filesystem.writeFile({
        path: targetPath,
        data: file.data, // Base64 retornado pelo FilePicker
        directory: Directory.Data,
      });

      console.log('[FilePicker] Arquivo persistido localmente:', targetPath);

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
      const { files } = await Filesystem.readdir({
        path: targetDir,
        directory: Directory.Data,
      });

      return files.map(file => ({
        name: typeof file === 'string' ? file : file.name,
        path: `${targetDir}/${typeof file === 'string' ? file : file.name}`
      }));
    } catch (e) {
      return [];
    }
  }
};
