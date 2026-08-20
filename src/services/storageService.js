import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * storageService - Unificação da camada de persistência para evitar erros de diretório.
 * Estratégia: Flat Storage (Tudo na raiz do Directory.Data)
 */
export const StorageService = {
  /**
   * Salva um arquivo de forma segura na raiz.
   */
  async saveFile(fileName, base64Data) {
    try {
      // Remove barras para garantir que fique na raiz
      const safeFileName = fileName.replace(/\//g, '_');

      await Filesystem.writeFile({
        path: safeFileName,
        data: base64Data,
        directory: Directory.Data,
        recursive: true
      });

      return true;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Lê um arquivo da raiz.
   */
  async readFile(fileName) {
    try {
      const result = await Filesystem.readFile({
        path: fileName,
        directory: Directory.Data
      });
      return result.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Lista arquivos filtrando por prefixo.
   */
  async listFiles(prefix = '') {
    try {
      const { files } = await Filesystem.readdir({
        path: '',
        directory: Directory.Data
      });

      const fileList = files.map(f => typeof f === 'string' ? f : f.name);

      if (!prefix) return fileList;
      return fileList.filter(name => name.startsWith(prefix));
    } catch (error) {
      return [];
    }
  },

  /**
   * Remove um arquivo da raiz.
   */
  async deleteFile(fileName) {
    try {
      await Filesystem.deleteFile({
        path: fileName,
        directory: Directory.Data
      });
      return true;
    } catch (error) {
      return false;
    }
  }
};
