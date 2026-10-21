import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { criarCicloMensalStorage } from './cicloMensalStorage.js';
import { exigirContaOffline } from './offlineQueueStorage.js';
import { enfileirarLeiturasAnteriores } from './syncOfflineService.js';
import { filesystemService } from './filesystemService.js';
import { obterLeituraAnterior } from './leiturasAnterioresService.js';

const ausente = error => error?.code === 'OS-PLUG-FILE-0008'
  || /not found|does not exist|enoent|no such/i.test(String(error?.message || error));

export const criarArquivoCiclo = (arquivos = Filesystem) => async plano => {
  const { condominio, condId, origem, id, owner, dados } = plano;
  const pasta = `Backups/${filesystemService.sanitizeName(condominio.nome)}_${origem}_${id}`;
  const fotos = new Map();
  for (const [key, path] of Object.entries(dados)) {
    if (!key.startsWith(`foto_path_${condId}_`)) continue;
    const directory = dados[key.replace('foto_path_', 'foto_directory_')] === 'CACHE' ? Directory.Cache : Directory.Data;
    fotos.set(`${directory}:${path}`, { path, directory });
  }
  // Versões anteriores também podiam manter fotos somente no Cache ou na raiz.
  const safeName = String(condominio.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
  for (const [path, directory, filtro] of (plano.incluirLegado ? [
    [`FastLeituras/${safeName}`, Directory.Cache, name => /^Apto.+_[a-zA-Z]+\.jpg$/.test(name)],
    ['', Directory.Data, name => name.startsWith(`leitura_foto_${condId}_`) && name.endsWith('.jpg')],
  ] : [])) {
    try {
      const { files } = await arquivos.readdir({ path, directory });
      for (const file of files) {
        const name = file.name || file;
        if (filtro(name)) {
          const source = path ? `${path}/${name}` : name;
          fotos.set(`${directory}:${source}`, { path: source, directory });
        }
      }
    } catch (error) { if (!ausente(error)) throw error; }
  }
  if (fotos.size) {
    try { await arquivos.readdir({ path: pasta, directory: Directory.Data }); }
    catch (error) {
      if (!ausente(error)) throw error;
      await arquivos.mkdir({ path: pasta, directory: Directory.Data, recursive: true });
    }
  }
  const copias = [];
  const nomes = new Set();
  for (const foto of fotos.values()) {
    const origemFoto = await arquivos.stat(foto);
    if (!origemFoto.size) throw new Error('Foto vazia no ciclo anterior. O fechamento foi cancelado.');
    const nome = foto.path.split('/').pop();
    const nomeUnico = nomes.has(nome) ? `${nomes.size}_${nome}` : nome;
    nomes.add(nomeUnico);
    const destino = `${pasta}/${nomeUnico}`;
    await arquivos.copy({ from: foto.path, directory: foto.directory, to: destino, toDirectory: Directory.Data });
    const copia = await arquivos.stat({ path: destino, directory: Directory.Data });
    if (copia.size !== origemFoto.size) throw new Error('A cópia da foto não foi confirmada. O fechamento foi cancelado.');
    copias.push({ origem: foto.path, directory: foto.directory, path: destino });
  }
  const path = `Ciclos/${owner}/${condId}/${origem}/${id}.json`;
  const data = JSON.stringify({ ...plano, fotosArquivadas: copias });
  await arquivos.writeFile({ path, data, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  const salvo = await arquivos.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
  if (salvo.data !== data) throw new Error('O histórico do ciclo não foi confirmado. Os cards foram preservados.');
};

export const cicloMensalService = criarCicloMensalStorage({
  storage: {
    get length() { return localStorage.length; },
    key: index => localStorage.key(index),
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: key => localStorage.removeItem(key),
  },
  exigirConta: exigirContaOffline,
  arquivar: criarArquivoCiclo(),
  enfileirar: enfileirarLeiturasAnteriores,
  gerarId: () => crypto.randomUUID(),
  obterAnterior: obterLeituraAnterior,
});

export const cicloJaFinalizado = condId => {
  const ciclo = JSON.parse(localStorage.getItem(`ciclo_mensal_${condId}`) || 'null');
  return Boolean(ciclo?.finalizado);
};
