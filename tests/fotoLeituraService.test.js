import test from 'node:test';
import assert from 'node:assert/strict';
import { Directory } from '@capacitor/filesystem';
import { criarFotoLeituraService } from '../src/services/fotoLeituraService.js';
import { filesystemService } from '../src/services/filesystemService.js';

const criarAparelho = () => {
  const dados = new Map();
  const disco = new Map();
  const storage = {
    get length() { return dados.size; },
    key: i => [...dados.keys()][i] ?? null,
    getItem: key => dados.get(key) ?? null,
    setItem: (key, value) => dados.set(key, String(value)),
    removeItem: key => dados.delete(key),
  };
  const chaveArquivo = ({ path, directory }) => `${directory}/${path}`;
  const arquivos = {
    async readdir() { return { files: [] }; },
    async mkdir() {},
    async writeFile(options) { disco.set(chaveArquivo(options), options.data); },
    async stat(options) {
      const data = disco.get(chaveArquivo(options));
      if (data === undefined) throw new Error('File does not exist');
      return { size: Buffer.from(data, 'base64').length, type: 'file' };
    },
    async readFile(options) {
      const data = disco.get(chaveArquivo(options));
      if (data === undefined) throw new Error('File does not exist');
      return { data };
    },
    async getUri(options) { return { uri: `file://${chaveArquivo(options)}` }; },
    async rename({ from, to, directory, toDirectory }) {
      const source = `${directory}/${from}`;
      const data = disco.get(source);
      if (data === undefined) throw new Error('File does not exist');
      disco.set(`${toDirectory}/${to}`, data);
      disco.delete(source);
    },
    async copy({ from, to, directory, toDirectory }) {
      const data = disco.get(`${directory}/${from}`);
      if (data === undefined) throw new Error('File does not exist');
      disco.set(`${toDirectory}/${to}`, data);
    },
    async deleteFile(options) { disco.delete(chaveArquivo(options)); },
  };
  const abrirApp = () => criarFotoLeituraService({
    storage,
    arquivos,
    // Testa também a gravação temporária/rename do serviço oficial de backup.
    backups: { salvarFotoCondominio: (...args) => filesystemService.salvarFotoCondominio(...args, arquivos) },
    converterUri: uri => uri,
  });
  return { storage, dados, disco, arquivos, abrirApp, service: abrirApp() };
};

const captura = (unidadeId = 'AP-101', servico = 'AGUA', condominioId = 'cond-1', condominioNome = 'Condomínio Teste') => ({
  chaveLocal: `${condominioId}_${unidadeId}_${servico.toLowerCase()}`,
  condominioId,
  condominioNome,
  unidadeId,
  servico,
  fileName: `Apto${unidadeId}_${servico}.jpg`,
  base64: Buffer.from(`foto-${condominioId}-${unidadeId}-${servico}`).toString('base64'),
  novaCaptura: true,
});

test('preserva as 14 fotos de sete unidades de água/gás antes de concluir qualquer leitura', async () => {
  const aparelho = criarAparelho();
  for (let unidade = 1; unidade <= 7; unidade++) {
    for (const servico of ['AGUA', 'GAS']) {
      const input = captura(`AP-${unidade}`, servico);
      await aparelho.service.salvarFoto(input);
      assert.equal(aparelho.storage.getItem(`valor_${input.chaveLocal}`), null);
      assert.equal(aparelho.storage.getItem(`concluido_${input.chaveLocal}`), null);
    }
  }

  // Reiniciar o app e apagar o Cache não elimina os rascunhos.
  const reaberto = aparelho.abrirApp();
  const fotos = await reaberto.listarFotosAtivas('cond-1');
  assert.equal(fotos.length, 14);
  assert.equal(aparelho.disco.size, 14);
  assert.equal(aparelho.storage.getItem('fila_sync_auto'), null);
  assert.equal(new Set(fotos.map(foto => `${foto.unidade}/${foto.servico}`)).size, 14);
  assert.ok(fotos.every(foto => foto.webUrl.startsWith(`file://${Directory.Data}/Backups/`)));
});

test('recupera a foto legada do Cache sem inventar valor nem conclusão', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const origem = { path: `FastLeituras/Teste/${input.fileName}`, directory: Directory.Cache };
  aparelho.disco.set(`${origem.directory}/${origem.path}`, input.base64);
  const path = await aparelho.service.garantirFoto({ ...input, base64: null, origem });
  aparelho.disco.delete(`${origem.directory}/${origem.path}`);

  assert.equal(aparelho.disco.get(`${Directory.Data}/${path}`), input.base64);
  assert.equal((await aparelho.abrirApp().listarFotosAtivas('cond-1')).length, 1);
  assert.equal(aparelho.storage.getItem(`valor_${input.chaveLocal}`), null);
  assert.equal(aparelho.storage.getItem(`concluido_${input.chaveLocal}`), null);
});

test('reutiliza a foto persistida em novas tentativas sem substituir por um Cache antigo', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const path = await aparelho.service.salvarFoto(input);
  aparelho.storage.setItem(`valor_${input.chaveLocal}`, '125.1234');
  aparelho.storage.setItem(`concluido_${input.chaveLocal}`, 'true');
  aparelho.storage.removeItem(`foto_pendente_${input.chaveLocal}`);

  assert.equal(await aparelho.service.garantirFoto({ ...input, base64: 'YW50aWdh' }), path);
  assert.equal(aparelho.disco.get(`${Directory.Data}/${path}`), input.base64);
  assert.equal(aparelho.storage.getItem(`valor_${input.chaveLocal}`), '125.1234');
  assert.equal(aparelho.storage.getItem(`concluido_${input.chaveLocal}`), 'true');
  assert.equal(aparelho.disco.size, 1);
});

test('uma falha parcial de disco preserva a foto e a leitura anteriores', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const path = await aparelho.service.salvarFoto(input);
  aparelho.storage.setItem(`valor_${input.chaveLocal}`, '125.1234');
  aparelho.storage.setItem(`concluido_${input.chaveLocal}`, 'true');
  aparelho.storage.removeItem(`foto_pendente_${input.chaveLocal}`);
  aparelho.arquivos.writeFile = async options => {
    aparelho.disco.set(`${options.directory}/${options.path}`, 'cGFyY2lhbA==');
    throw new Error('Sem espaço');
  };

  await assert.rejects(aparelho.service.salvarFoto({ ...input, base64: 'bm92YQ==' }), /Sem espaço/);
  assert.equal(aparelho.disco.get(`${Directory.Data}/${path}`), input.base64);
  assert.equal(aparelho.disco.size, 1);
  assert.equal(aparelho.storage.getItem(`concluido_${input.chaveLocal}`), 'true');
  assert.equal(aparelho.storage.getItem(`valor_${input.chaveLocal}`), '125.1234');
});

test('uma primeira captura que falha não cria referência nem conclusão fictícia', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  aparelho.arquivos.writeFile = async () => { throw new Error('Sem espaço'); };
  await assert.rejects(aparelho.service.salvarFoto(input), /Sem espaço/);
  assert.equal(aparelho.dados.size, 0);
  assert.equal((await aparelho.service.listarFotosAtivas('cond-1')).length, 0);
});

test('não aceita arquivo vazio ou caminho inexistente como prova de foto salva', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  aparelho.arquivos.writeFile = async options => aparelho.disco.set(`${options.directory}/${options.path}`, '');
  await assert.rejects(aparelho.service.salvarFoto(input), /arquivo vazio/);
  assert.equal(aparelho.dados.size, 0);
  assert.equal(aparelho.disco.size, 0);

  aparelho.storage.setItem(`foto_path_${input.chaveLocal}`, 'arquivo-ausente.jpg');
  aparelho.storage.setItem(`foto_pendente_${input.chaveLocal}`, 'true');
  assert.equal(await aparelho.service.obterFoto(input.chaveLocal), null);
  await assert.rejects(aparelho.service.garantirFoto({ ...input, base64: null }), /não foi encontrada/);
});

test('uma nova captura bem-sucedida aguarda nova validação sem reutilizar o valor anterior', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  await aparelho.service.salvarFoto(input);
  aparelho.storage.setItem(`valor_${input.chaveLocal}`, '125.1234');
  aparelho.storage.setItem(`concluido_${input.chaveLocal}`, 'true');

  aparelho.storage.setItem('valor_cond-1_AP-101_AGUA', '100');
  aparelho.storage.setItem('concluido_cond-1_AP-101_AGUA', 'true');
  await aparelho.service.salvarFoto({ ...input, base64: 'bm92YQ==' });
  assert.equal(aparelho.storage.getItem(`valor_${input.chaveLocal}`), null);
  assert.equal(aparelho.storage.getItem(`concluido_${input.chaveLocal}`), null);
  assert.equal(aparelho.storage.getItem(`foto_pendente_${input.chaveLocal}`), 'true');
  assert.equal(aparelho.storage.getItem('valor_cond-1_AP-101_AGUA'), null);
  assert.equal(aparelho.storage.getItem('concluido_cond-1_AP-101_AGUA'), null);
  assert.equal(aparelho.disco.size, 1);
});

test('não substitui uma foto que ainda pode ser consumida pela sincronização', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const path = await aparelho.service.salvarFoto(input);
  const fila = [{ condominio_id: input.condominioId, unidade_id: input.unidadeId, servico: input.servico, photoPath: path }];
  aparelho.storage.setItem('fila_sync_auto', JSON.stringify(fila));
  assert.throws(() => aparelho.service.verificarSubstituicao(input), /envio pendente/);
  await assert.rejects(aparelho.service.salvarFoto({ ...input, base64: 'bm92YQ==' }), /envio pendente/);
  assert.equal(aparelho.disco.get(`${Directory.Data}/${path}`), input.base64);
  assert.deepEqual(JSON.parse(aparelho.storage.getItem('fila_sync_auto')), fila);
});

test('mantém água/gás, unidades com underscore e condomínios separados', async () => {
  const aparelho = criarAparelho();
  const agua = captura('AP_101');
  await aparelho.service.salvarFoto(agua);
  aparelho.storage.setItem('fila_sync_auto', JSON.stringify([{ condominio_id: 'cond-1', unidade_id: 'AP_101', servico: 'AGUA' }]));
  await aparelho.service.salvarFoto(captura('AP_101', 'GAS'));
  await aparelho.service.salvarFoto(captura('AP_101', 'AGUA', 'cond-2', 'Outro Condomínio'));
  assert.deepEqual((await aparelho.service.listarFotosAtivas('cond-1')).map(f => [f.unidade, f.servico]), [['AP_101', 'agua'], ['AP_101', 'gas']]);
  assert.equal((await aparelho.service.listarFotosAtivas('cond-2')).length, 1);
});

test('limpar as referências do ciclo preserva o backup sem reabrir fotos históricas', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const path = await aparelho.service.salvarFoto(input);
  aparelho.service.esquecerFoto(input.chaveLocal);
  assert.equal((await aparelho.abrirApp().listarFotosAtivas('cond-1')).length, 0);
  assert.equal(aparelho.disco.get(`${Directory.Data}/${path}`), input.base64);
});

test('erro de acesso ao disco não é tratado como foto ausente nem substituído por outra imagem', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const path = await aparelho.service.salvarFoto(input);
  aparelho.arquivos.stat = async () => { throw new Error('Permission denied'); };
  await assert.rejects(aparelho.service.garantirFoto({ ...input, base64: 'bm92YQ==' }), /Permission denied/);
  assert.equal(aparelho.disco.get(`${Directory.Data}/${path}`), input.base64);
});

test('falha na substituição final não apaga a foto existente nem deixa temporário no lote', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const path = await aparelho.service.salvarFoto(input);
  aparelho.arquivos.rename = async ({ to, toDirectory }) => {
    // Comportamento real do plugin Android: remove o destino antes do rename.
    aparelho.disco.delete(`${toDirectory}/${to}`);
    throw new Error('Falha na substituição');
  };
  await assert.rejects(aparelho.service.salvarFoto({ ...input, base64: 'bm92YQ==' }), /Falha na substituição/);
  assert.equal(aparelho.disco.get(`${Directory.Data}/${path}`), input.base64);
  assert.equal(aparelho.disco.size, 1);
});

test('se o Android impedir também a restauração, a referência passa à cópia de recuperação preservada', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const path = await aparelho.service.salvarFoto(input);
  aparelho.storage.setItem(`valor_${input.chaveLocal}`, '125.1234');
  aparelho.storage.setItem(`concluido_${input.chaveLocal}`, 'true');
  aparelho.storage.removeItem(`foto_pendente_${input.chaveLocal}`);
  const copiar = aparelho.arquivos.copy;
  aparelho.arquivos.copy = async options => {
    if (options.to === path) throw new Error('Disco não aceita restauração');
    return copiar(options);
  };
  aparelho.arquivos.rename = async ({ to, toDirectory }) => {
    aparelho.disco.delete(`${toDirectory}/${to}`);
    throw new Error('Falha na substituição');
  };
  await assert.rejects(aparelho.service.salvarFoto({ ...input, base64: 'bm92YQ==' }), /cópia de recuperação/);
  const recuperada = await aparelho.abrirApp().obterFoto(input.chaveLocal);
  assert.ok(recuperada.path.endsWith('.anterior.jpg'));
  assert.equal(aparelho.disco.get(`${Directory.Data}/${recuperada.path}`), input.base64);
  assert.equal(aparelho.storage.getItem(`valor_${input.chaveLocal}`), '125.1234');
  assert.equal(aparelho.storage.getItem(`concluido_${input.chaveLocal}`), 'true');
});

test('falha de quota nos metadados mantém a nova foto no backup sem validá-la com o número antigo', async () => {
  const aparelho = criarAparelho();
  const input = captura();
  const path = await aparelho.service.salvarFoto(input);
  aparelho.storage.setItem(`valor_${input.chaveLocal}`, '125.1234');
  aparelho.storage.setItem(`concluido_${input.chaveLocal}`, 'true');
  aparelho.storage.removeItem(`foto_pendente_${input.chaveLocal}`);
  const salvar = aparelho.storage.setItem;
  aparelho.storage.setItem = (key, value) => {
    if (key.startsWith('foto_pendente_')) throw new Error('QuotaExceededError');
    salvar(key, value);
  };
  await assert.rejects(aparelho.service.salvarFoto({ ...input, base64: 'bm92YQ==' }), /QuotaExceededError/);
  assert.equal(aparelho.disco.get(`${Directory.Data}/${path}`), 'bm92YQ==');
  assert.equal(aparelho.storage.getItem(`valor_${input.chaveLocal}`), null);
  assert.equal(aparelho.storage.getItem(`concluido_${input.chaveLocal}`), null);
});
