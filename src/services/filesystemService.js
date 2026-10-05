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
    const recoveryPath = `${tempPath}.anterior.jpg`;
    let anterior = null;
    let substituicaoIniciada = false;
    let preservarRecuperacao = false;

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

      try {
        anterior = await arquivos.stat({ path: filePath, directory: Directory.Data });
      } catch (err) {
        if (err?.code !== 'OS-PLUG-FILE-0008'
          && !/not found|does not exist|enoent|no such/i.test(String(err?.message || err))) throw err;
      }
      // O plugin Android apaga o destino antes do rename. Manter a versão
      // anterior em disco até a nova foto estar confirmada no destino final.
      if (anterior) {
        await arquivos.copy({ from: filePath, to: recoveryPath, directory: Directory.Data, toDirectory: Directory.Data });
        const copia = await arquivos.stat({ path: recoveryPath, directory: Directory.Data });
        if (copia.size !== anterior.size) throw new Error('Não foi possível proteger a foto anterior.');
      }
      substituicaoIniciada = true;
      await arquivos.rename({
        from: tempPath,
        to: filePath,
        directory: Directory.Data,
        toDirectory: Directory.Data
      });
      const final = await arquivos.stat({ path: filePath, directory: Directory.Data });
      if (final.size !== arquivo.size) throw new Error('A substituição da foto não foi confirmada.');
    } catch (err) {
      if (anterior && substituicaoIniciada) {
        try {
          await arquivos.copy({ from: recoveryPath, to: filePath, directory: Directory.Data, toDirectory: Directory.Data });
          const restaurada = await arquivos.stat({ path: filePath, directory: Directory.Data });
          if (restaurada.size !== anterior.size) throw new Error('Restauração incompleta.');
        } catch {
          // Se o disco impedir também a restauração, preservar e referenciar
          // a cópia comprovada para reabertura e acesso pelo menu de backups.
          preservarRecuperacao = true;
          err.fotoPreservadaPath = recoveryPath;
          err.message += ' A foto anterior permanece na cópia de recuperação do backup offline.';
        }
      }
      try {
        await arquivos.deleteFile({ path: tempPath, directory: Directory.Data });
      } catch {}
      throw err;
    } finally {
      if (!preservarRecuperacao) {
        try {
          await arquivos.deleteFile({ path: recoveryPath, directory: Directory.Data });
        } catch {}
      }
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
