import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { filesystemService } from './filesystemService.js';

// A foto pertence ao ciclo ativo mesmo quando a leitura ainda não foi validada.
// Reutiliza o backup oficial; fotos pendentes nunca entram na fila de leituras.
export const criarFotoLeituraService = ({
  arquivos = Filesystem,
  backups = filesystemService,
  storage = globalThis.localStorage,
  converterUri = (uri) => Capacitor.convertFileSrc(uri),
} = {}) => ({
  verificarSubstituicao({ chaveLocal, condominioId, unidadeId, servico }) {
    if (!condominioId || !unidadeId || !servico) throw new Error('Identificação da captura incompleta.');
    const fila = JSON.parse(storage.getItem('fila_sync_auto') || '[]');
    if (!Array.isArray(fila)) throw new Error('Não foi possível verificar os envios pendentes.');
    const pathAtual = storage.getItem(`foto_path_${chaveLocal}`);
    if (fila.some(item => (pathAtual && item.photoPath === pathAtual)
      || (String(item.condominio_id) === String(condominioId)
      && String(item.unidade_id).trim() === String(unidadeId).trim()
      && String(item.servico).toUpperCase() === String(servico).toUpperCase()))) {
      throw new Error('Esta unidade possui um envio pendente. Sincronize a leitura antes de substituir a foto. A foto anterior foi preservada.');
    }
  },

  async salvarFoto({ chaveLocal, condominioId, condominioNome, unidadeId, servico, fileName, base64, novaCaptura = false }) {
    if (!chaveLocal || !base64) throw new Error('Foto ou identificação da unidade ausente.');
    if (novaCaptura) this.verificarSubstituicao({ chaveLocal, condominioId, unidadeId, servico });

    const path = await backups.salvarFotoCondominio(condominioNome, fileName, base64);
    const arquivo = await arquivos.stat({ path, directory: Directory.Data });
    if (!arquivo.size) throw new Error('O aparelho não confirmou o arquivo da foto.');

    storage.setItem(`foto_path_${chaveLocal}`, path);
    storage.setItem(`foto_directory_${chaveLocal}`, 'DATA');
    if (novaCaptura || storage.getItem(`concluido_${chaveLocal}`) !== 'true') {
      storage.setItem(`foto_pendente_${chaveLocal}`, 'true');
    }
    if (novaCaptura) {
      const chaveLegada = `${chaveLocal.slice(0, chaveLocal.lastIndexOf('_'))}_${String(servico).toUpperCase()}`;
      for (const chave of [chaveLocal, chaveLegada]) {
        storage.removeItem(`valor_${chave}`);
        storage.removeItem(`concluido_${chave}`);
      }
    }
    return path;
  },

  async obterFoto(chaveLocal) {
    const path = storage.getItem(`foto_path_${chaveLocal}`);
    const pendente = storage.getItem(`foto_pendente_${chaveLocal}`) === 'true';
    const concluida = storage.getItem(`concluido_${chaveLocal}`) === 'true'
      && Boolean(storage.getItem(`valor_${chaveLocal}`));
    if (!path || (!pendente && !concluida)) return null;

    // getUri sozinho não confirma que o arquivo existe.
    try {
      const arquivo = await arquivos.stat({ path, directory: Directory.Data });
      if (!arquivo.size) return null;
      const { uri } = await arquivos.getUri({ path, directory: Directory.Data });
      return { path, webUrl: converterUri(uri) };
    } catch (err) {
      if (err?.code === 'OS-PLUG-FILE-0008'
        || /not found|does not exist|enoent|no such/i.test(String(err?.message || err))) return null;
      throw err;
    }
  },

  async garantirFoto({ chaveLocal, condominioNome, fileName, base64 = null, origem = null }) {
    const salva = await this.obterFoto(chaveLocal);
    if (salva) return salva.path;

    // Recupera capturas da versão anterior que ainda existem apenas no Cache.
    if (!base64 && origem) {
      const arquivo = await arquivos.readFile(origem);
      base64 = arquivo.data;
    }
    if (!base64) throw new Error('A foto não foi encontrada no aparelho. Capture-a novamente.');
    return this.salvarFoto({ chaveLocal, condominioNome, fileName, base64 });
  },

  async listarFotosAtivas(condominioId) {
    const prefixo = `foto_path_${condominioId}_`;
    const chaves = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefixo)) chaves.push(key);
    }

    const fotos = [];
    for (const key of chaves) {
      const identidade = key.slice(prefixo.length);
      const separador = identidade.lastIndexOf('_');
      if (separador < 1) continue;
      const chaveLocal = key.slice('foto_path_'.length);
      const foto = await this.obterFoto(chaveLocal);
      if (foto) fotos.push({
        ...foto,
        unidade: identidade.slice(0, separador),
        servico: identidade.slice(separador + 1).toLowerCase(),
      });
    }
    return fotos;
  },

  esquecerFoto(chaveLocal) {
    for (const prefixo of ['foto_path', 'foto_directory', 'foto_pendente']) {
      storage.removeItem(`${prefixo}_${chaveLocal}`);
    }
  },
});

export const FotoLeituraService = criarFotoLeituraService();
