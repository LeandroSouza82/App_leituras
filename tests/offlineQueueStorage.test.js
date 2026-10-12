import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFLINE_OWNER_KEY, lerFilaPersistida, gravarFilaPersistida, donoDoItem, periodoDoItem,
  enfileirarLeituraPersistida, removerItemConfirmado, atualizarItemPersistido,
  prepararContaOffline, encerrarContaOffline, contaOfflineAtiva, capturarContextoSync, obterIdentificadorLeitura, resumirPendenciasOffline,
} from '../src/services/offlineQueueStorage.js';

const aparelho = () => {
  const data = new Map();
  const storage = {
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  return { storage, data };
};
const item = (extra = {}) => ({
  id: crypto.randomUUID(), db_id: crypto.randomUUID(), leiturista_id: 'conta-A',
  condominio_id: 'cond-1', unidade_id: 'A-101', servico: 'AGUA',
  data_leitura: '2026-09-15T12:00:00Z', mes_referencia: '2026-09', ...extra,
});

test('falha de quota não informa sucesso nem altera a fila anterior', () => {
  const { storage } = aparelho();
  const anterior = [item()];
  gravarFilaPersistida('fila_sync_auto', anterior, storage);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => enfileirarLeituraPersistida(item(), storage), /Quota/);
  assert.deepEqual(lerFilaPersistida('fila_sync_auto', storage), anterior);
});

test('setItem sem persistência não confirma enfileiramento', () => {
  const { storage } = aparelho();
  storage.setItem = () => {};
  assert.throws(() => enfileirarLeituraPersistida(item(), storage), /não foi confirmada/);
});

test('JSON corrompido ou não array permanece intacto após tentativa de enfileirar', () => {
  for (const raw of ['[incompleto', 'null', '{}', 'undefined']) {
    const { storage } = aparelho();
    storage.setItem('fila_sync_auto', raw);
    assert.throws(() => enfileirarLeituraPersistida(item(), storage));
    assert.equal(storage.getItem('fila_sync_auto'), raw);
  }
});

test('contas, meses, serviços e unidades distintos não se sobrescrevem', () => {
  const { storage } = aparelho();
  const items = [item(), item({ mes_referencia: '2026-10' }), item({ leiturista_id: 'conta-B' }),
    item({ servico: 'GAS' }), item({ unidade_id: 'A-102' }), item({ condominio_id: 'cond-2' })];
  items.forEach(i => enfileirarLeituraPersistida(i, storage));
  assert.deepEqual(lerFilaPersistida('fila_sync_auto', storage), items);
  const revisao = item({ leitura_atual: 228.665 });
  enfileirarLeituraPersistida(revisao, storage);
  assert.deepEqual(lerFilaPersistida('fila_sync_auto', storage), [revisao, ...items.slice(1)]);
});

test('um db_id de outra identidade não pode ser reaproveitado', () => {
  const { storage } = aparelho();
  const setembro = item();
  enfileirarLeituraPersistida(setembro, storage);
  assert.throws(() => enfileirarLeituraPersistida(item({ db_id: setembro.db_id, mes_referencia: '2026-10' }), storage), /outra conta ou período/);
  assert.deepEqual(lerFilaPersistida('fila_sync_auto', storage), [setembro]);
});

test('remoção após envio preserva revisão concorrente e itens recém-enfileirados', () => {
  const { storage } = aparelho();
  const enviada = item();
  const editada = { ...enviada, leitura_atual: 230 };
  const nova = item({ unidade_id: 'A-102' });
  gravarFilaPersistida('fila_sync_auto', [editada, nova], storage);
  removerItemConfirmado('fila_sync_auto', enviada, storage);
  assert.deepEqual(lerFilaPersistida('fila_sync_auto', storage), [editada, nova]);
});

test('atualizar caminho não altera uma revisão diferente da que estava sendo enviada', () => {
  const { storage } = aparelho();
  const antiga = item();
  const nova = { ...antiga, leitura_atual: 250 };
  gravarFilaPersistida('fila_sync_auto', [nova], storage);
  assert.throws(() => atualizarItemPersistido('fila_sync_auto', antiga, { remotePath: 'novo.jpg' }, storage), /alterada/);
  assert.deepEqual(lerFilaPersistida('fila_sync_auto', storage), [nova]);
});

test('logout e reentrada na mesma conta preservam filas, fotos e estado pendente', () => {
  const { storage, data } = aparelho();
  prepararContaOffline('conta-A', storage);
  storage.setItem('fila_sync_auto', JSON.stringify([item()]));
  storage.setItem('foto_path_cond-1_A-101_agua', 'Backups/Condo/AptoA-101_AGUA.jpg');
  storage.setItem('foto_pendente_cond-1_A-101_agua', 'true');
  const antes = new Map(data);
  encerrarContaOffline();
  assert.equal(contaOfflineAtiva(storage), null);
  assert.deepEqual(data, antes);
  prepararContaOffline('conta-A', storage);
  assert.deepEqual(data, antes);
});

test('outra conta não abre estado offline preservado; dados permanecem intactos', () => {
  const { storage, data } = aparelho();
  prepararContaOffline('conta-A', storage);
  storage.setItem('fila_sync_condominios', JSON.stringify([{ id: 'sem-dono-legado' }]));
  const antes = new Map(data);
  encerrarContaOffline();
  assert.throws(() => prepararContaOffline('conta-B', storage), /outra conta/);
  assert.equal(contaOfflineAtiva(storage), null);
  assert.deepEqual(data, antes);
  assert.equal(donoDoItem(lerFilaPersistida('fila_sync_condominios', storage)[0]), null);
});

test('troca é permitida em aparelho sem dados offline; dono divergente ou ausência nunca autorizam envio', () => {
  const { storage } = aparelho();
  prepararContaOffline('conta-A', storage);
  prepararContaOffline('conta-B', storage);
  assert.equal(storage.getItem(OFFLINE_OWNER_KEY), 'conta-B');
  assert.equal(donoDoItem({ leiturista_id: 'conta-A', _offline_user_id: 'conta-B' }), null);
  assert.equal(donoDoItem({}), null);
});

test('mês explícito inválido não é corrigido por inferência; ausência de data não usa mês de hoje', () => {
  assert.equal(periodoDoItem({ mes_referencia: '2026-13', data_leitura: '2026-09-15' }), null);
  assert.equal(periodoDoItem({}), null);
  assert.equal(periodoDoItem({ data_leitura: '2026-09-15T12:00:00Z' }), '2026-09');
});

test('sessão capturada usa identidade verificada e conserva o token original', async () => {
  const { storage } = aparelho();
  prepararContaOffline('conta-A', storage);
  const auth = {
    getSession: async () => ({ data: { session: { user: { id: 'conta-A' }, access_token: 'token-A' } } }),
    getUser: async token => { assert.equal(token, 'token-A'); return { data: { user: { id: 'conta-A' } } }; },
  };
  const captured = await capturarContextoSync(auth, (token, guard) => ({ token, guard }), storage);
  assert.equal(captured.client.token, 'token-A');
  encerrarContaOffline();
  assert.throws(captured.assertActive, /desconectada/);
  assert.throws(captured.client.guard, /desconectada/);
});

test('troca de conta durante getUser cancela o ciclo sem criar cliente de envio', async () => {
  const { storage } = aparelho();
  prepararContaOffline('conta-A', storage);
  const auth = {
    getSession: async () => ({ data: { session: { user: { id: 'conta-A' }, access_token: 'token-A' } } }),
    getUser: async () => { prepararContaOffline('conta-B', storage); return { data: { user: { id: 'conta-A' } } }; },
  };
  const result = await capturarContextoSync(auth, () => assert.fail('Não deve criar cliente'), storage);
  assert.equal(result, null);
});

test('ID da fila de setembro não é reutilizado no mês de outubro', () => {
  const setembro = item();
  const outubro = item({ mes_referencia: '2026-10' });
  const resultado = obterIdentificadorLeitura(outubro, [setembro], {}, () => 'uuid-outubro');
  assert.equal(resultado.id, 'uuid-outubro');
  assert.equal(JSON.parse(resultado.key).at(-1), '2026-10');
});

test('reentrada reaproveita somente ID da mesma conta, unidade, serviço e período', () => {
  const pendente = item();
  const resultado = obterIdentificadorLeitura(pendente, [pendente], {}, () => assert.fail('Não deve gerar outro ID'));
  const mapa = { [resultado.key]: resultado.id };
  assert.deepEqual(obterIdentificadorLeitura(pendente, [], mapa, () => assert.fail('Não deve gerar outro ID')), resultado);
});

test('ID legado do mesmo mês impede duplicação até conferir o envio anterior', () => {
  const leitura = item();
  const antigo = { 'cond-1|A-101|AGUA|2026|9': 'uuid-legado' };
  assert.throws(() => obterIdentificadorLeitura(leitura, [], antigo, () => assert.fail('Não deve gerar outro ID')), /identificador antigo/);
  assert.deepEqual(antigo, { 'cond-1|A-101|AGUA|2026|9': 'uuid-legado' });
});

test('aviso de revisão mantém contagens comprovadas e não inventa contagem para JSON inválido', () => {
  const { storage } = aparelho();
  prepararContaOffline('conta-A', storage);
  storage.setItem('fila_sync_auto', JSON.stringify([item()]));
  storage.setItem('leituras_pendentes', JSON.stringify([{ tempId: 1, nome: 'Antigo' }]));
  storage.setItem('fila_sync_condominios', '[inválido');
  assert.deepEqual(resumirPendenciasOffline(storage), { quantidade: 2, precisaRevisao: true });
});
