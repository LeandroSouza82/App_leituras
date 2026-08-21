import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const BASE_DIR = 'Backups';

export const filesystemService = {
  sanitizeName: (name) => {
    return name.replace(/[^a-z0-9]/gi, '_');
  },

  salvarFotoCondominio: async (condominioNome, fileName, base64Data) => {
    const safeCondo = filesystemService.sanitizeName(condominioNome);
    const dirPath = `${BASE_DIR}/${safeCondo}`;
    const filePath = `${dirPath}/${fileName}`;

    try {
      await Filesystem.readdir({ path: dirPath, directory: Directory.Data });
    } catch {
      await Filesystem.mkdir({ path: dirPath, directory: Directory.Data, recursive: true });
    }

    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

    await Filesystem.writeFile({
      path: filePath,
      data: cleanBase64,
      directory: Directory.Data,
      recursive: true
    });

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
