import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const BASE_DIR = 'Backups';

export const filesystemService = {
  sanitizeName: (name) => {
    return name.replace(/[^a-z0-9]/gi, '_');
  },

  salvarFotoCondominio: async (condominioNome, fileName, base64Data, arquivos = Filesystem) => {
    const safeCondo = filesystemService.sanitizeName(condominioNome);
    const dirPath = `${BASE_DIR}/${safeCondo}`;
    const filePath = `${dirPath}/${fileName}`;
    const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;

    try {
      await arquivos.readdir({ path: dirPath, directory: Directory.Data });
    } catch {
      await arquivos.mkdir({ path: dirPath, directory: Directory.Data, recursive: true });
    }

    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

    // Não truncar uma foto existente antes de confirmar a nova gravação.
    try {
      await arquivos.writeFile({
        path: tempPath,
        data: cleanBase64,
        directory: Directory.Data,
        recursive: true
      });
      const arquivo = await arquivos.stat({ path: tempPath, directory: Directory.Data });
      if (!arquivo.size) throw new Error('A gravação da foto retornou um arquivo vazio.');
      await arquivos.rename({
        from: tempPath,
        to: filePath,
        directory: Directory.Data,
        toDirectory: Directory.Data
      });
    } catch (err) {
      try {
        await arquivos.deleteFile({ path: tempPath, directory: Directory.Data });
      } catch {}
      throw err;
    }

    return filePath;
  },

  listarLotes: async () => {
    try {
      const result = await Filesystem.readdir({ path: BASE_DIR, directory: Directory.Data });
      return result.files;
    } catch {
      return [];
    }
  },

  listarFotosLote: async (safeCondoName) => {
    try {
      const result = await Filesystem.readdir({ path: `${BASE_DIR}/${safeCondoName}`, directory: Directory.Data });
      return result.files;
    } catch {
      return [];
    }
  },

  lerFotoBase64: async (filePath) => {
    const result = await Filesystem.readFile({ path: filePath, directory: Directory.Data });
    return result.data;
  },

  excluirLote: async (safeCondoName) => {
    await Filesystem.rmdir({ path: `${BASE_DIR}/${safeCondoName}`, directory: Directory.Data, recursive: true });
  }
};

export const salvarArquivoSeguro = async (fileName, data) => {
  await Filesystem.writeFile({
    path: fileName,
    data: data,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true
  });
};

export const salvarArquivoBinarioSeguro = async (fileName, base64Data) => {
  const cleanBase64 = typeof base64Data === 'string' && base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  await Filesystem.writeFile({
    path: fileName,
    data: cleanBase64,
    directory: Directory.Data,
    recursive: true
  });
};
