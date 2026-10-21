import test from 'node:test';
import assert from 'node:assert/strict';
import { criarCicloMensalStorage } from '../src/services/cicloMensalStorage.js';

const condominio = { id: 'c-1', nome: 'São Bento' };
const options = extra => ({ condominio, mesAtual: '2026-11', ...extra });
const fixture = () => {
  const dados = new Map();
  const backups = [];
  const lotes = [];
  let owner = 'conta-A';
  let falhaGravacao = null;
  const storage = {
    get length() { return dados.size; }, key: i => [...dados.keys()][i] ?? null,
    getItem: key => dados.get(key) ?? null,
    setItem(key, value) { if (key === falhaGravacao) throw new Error('Quota'); dados.set(key, String(value)); },
    removeItem: key => dados.delete(key),
  };
  const deps = {
    storage,
    exigirConta(expected = owner) { if (expected !== owner) throw new Error('Conta mudou'); return owner; },
    async arquivar(plano) { backups.push(structuredClone(plano)); },
    enfileirar(...args) { lotes.push(args); }, gerarId: () => crypto.randomUUID(),
  };
  const f = { dados, storage, backups, lotes, deps,
    abrir: () => criarCicloMensalStorage(deps),
    trocarConta: () => { owner = 'conta-B'; }, falharEm: key => { falhaGravacao = key; },
    ciclo(mes = '2026-10') { dados.set('ciclo_mensal_c-1', JSON.stringify({ owner, mes, finalizado: false })); },
    leitura(unidade = 'A-101', servico = 'agua', valor = '120') {
      const key = `c-1_${unidade}_${servico}`;
      dados.set(`valor_${key}`, valor); dados.set(`concluido_${key}`, 'true');
      dados.set(`foto_path_${key}`, `Backups/Sao_Bento/Apto${unidade}_${servico.toUpperCase()}.jpg`);
      dados.set(`foto_directory_${key}`, 'DATA');
    },
    anteriores: () => JSON.parse(dados.get('leituras_anteriores_c-1') || '[]'),
  };
  return f;
};

test('primeira atualização identifica o ciclo sem limpar ou inventar o mês dos dados legados', async () => {
  const f = fixture(); f.leitura();
  assert.equal((await f.abrir().processar(options())).inicializado, true);
  assert.equal(f.dados.get('valor_c-1_A-101_agua'), '120');
  assert.equal(f.backups.length, 0);
  assert.equal(f.lotes.length, 0);
});

test('virada offline promove água, gás e energia, zera cards e preserva unidade sem leitura e outro condomínio', async () => {
  const f = fixture(); f.ciclo();
  f.leitura(); f.leitura('A-101', 'gas', '45,0320'); f.leitura('B-201', 'energia', '0');
  f.dados.set('leituras_anteriores_c-1', JSON.stringify([{ unidade: 'A-101', leitura_anterior: 100 }, { unidade: 'C-301', leitura_anterior: 70 }]));
  f.dados.set('valor_c-10_A-101_agua', '999');
  const fila = JSON.stringify([{ db_id: 'envio-antigo', photoPath: 'foto-antiga.jpg', mes_referencia: '2026-10' }]);
  f.dados.set('fila_sync_auto', fila);
  assert.equal((await f.abrir().processar(options())).promovidas, 3);
  const anteriores = f.anteriores();
  assert.equal(anteriores.find(u => u.unidade === 'A-101').leitura_anterior, 120);
  assert.equal(anteriores.find(u => u.unidade === 'A-101').leitura_anterior_gas, 45.032);
  assert.equal(anteriores.find(u => u.unidade === 'B-201').leitura_anterior_energia, 0);
  assert.equal(anteriores.find(u => u.unidade === 'C-301').leitura_anterior, 70);
  assert.equal(f.dados.get('valor_c-1_A-101_agua'), undefined);
  assert.equal(f.dados.get('concluido_c-1_A-101_agua'), undefined);
  assert.equal(f.dados.get('foto_path_c-1_A-101_agua'), undefined);
  assert.equal(f.dados.get('valor_c-10_A-101_agua'), '999');
  assert.equal(f.dados.get('fila_sync_auto'), fila);
  assert.equal(f.backups[0].dados['valor_c-1_A-101_agua'], '120');
  assert.equal(f.backups[0].origem, '2026-10');
  assert.equal(f.lotes.length, 3);
  assert.equal(f.lotes[0][3].mesReferencia, '2026-11');
});

test('reabrir no mesmo mês não promove novamente; manual e automático usam o mesmo fechamento', async () => {
  const f = fixture(); f.ciclo(); f.leitura();
  await f.abrir().processar(options({ manual: true, mesAtual: '2026-10' }));
  await f.abrir().processar(options({ mesAtual: '2026-10' }));
  assert.equal(f.backups.length, 1);
  assert.equal(f.anteriores()[0].leitura_anterior, 120);
});

test('processa virada de ano e meses sem abrir o app sem promover duas vezes', async () => {
  const f = fixture(); f.ciclo('2026-12'); f.leitura();
  await f.abrir().processar(options({ mesAtual: '2027-03' }));
  await f.abrir().processar(options({ mesAtual: '2027-03' }));
  assert.equal(f.backups.length, 1);
  assert.equal(f.anteriores()[0].leitura_anterior, 120);
});

test('relógio voltando para um mês anterior não limpa dados', async () => {
  const f = fixture(); f.ciclo('2026-12'); f.leitura();
  await assert.rejects(f.abrir().processar(options()), /data do aparelho/);
  assert.equal(f.dados.get('valor_c-1_A-101_agua'), '120');
});

for (const [nome, preparar, erro] of [
  ['menor que anterior', f => { f.dados.set('leituras_anteriores_c-1', JSON.stringify([{ unidade: 'A-101', leitura_anterior: 130 }])); }, /menor/],
  ['valor inválido', f => f.dados.set('valor_c-1_A-101_agua', 'inválida'), /inválida/],
  ['foto aguardando correção', f => f.dados.set('foto_pendente_c-1_A-101_agua', 'true'), /pendente/],
  ['card concluído sem valor', f => f.dados.delete('valor_c-1_A-101_agua'), /sem leitura/],
  ['histórico corrompido', f => f.dados.set('leituras_anteriores_c-1', '{corrompido'), /JSON/],
]) test(`${nome} impede a limpeza e mantém fotos e cards para correção`, async () => {
  const f = fixture(); f.ciclo(); f.leitura(); preparar(f);
  const antes = structuredClone(f.dados);
  await assert.rejects(f.abrir().processar(options()), erro);
  assert.deepEqual(f.dados, antes);
  assert.equal(f.backups.length, 0);
});

test('leitura igual à anterior é válida', async () => {
  const f = fixture(); f.ciclo(); f.leitura();
  f.dados.set('leituras_anteriores_c-1', '[{"unidade":"A-101","leitura_anterior":120}]');
  assert.equal((await f.abrir().processar(options())).promovidas, 1);
});

test('falha no disco preserva os dados; reiniciar retoma o mesmo backup', async () => {
  const f = fixture(); f.ciclo(); f.leitura();
  f.deps.arquivar = async () => { throw new Error('Sem espaço no disco'); };
  await assert.rejects(f.abrir().processar(options()), /Sem espaço/);
  assert.equal(f.dados.get('valor_c-1_A-101_agua'), '120');
  assert.equal(f.dados.get('concluido_c-1_A-101_agua'), 'true');
  assert.equal(f.anteriores().length, 0);
  const diario = JSON.parse(f.dados.get('ciclo_mensal_diario_c-1'));
  f.deps.arquivar = async plano => f.backups.push(plano);
  await f.abrir().processar(options());
  assert.equal(f.backups[0].id, diario.id);
  assert.equal(f.dados.has('ciclo_mensal_diario_c-1'), false);
  assert.equal(f.anteriores()[0].leitura_anterior, 120);
});

for (const key of ['leituras_anteriores_c-1', 'ciclo_mensal_c-1']) {
  test(`interrupção na gravação de ${key} retoma após reiniciar sem perder valores`, async () => {
    const f = fixture(); f.ciclo(); f.leitura(); f.falharEm(key);
    await assert.rejects(f.abrir().processar(options()), /Quota/);
    assert.equal(f.dados.has('ciclo_mensal_diario_c-1'), true);
    f.falharEm(null);
    assert.equal((await f.abrir().processar(options())).promovidas, 1);
    assert.equal(f.anteriores()[0].leitura_anterior, 120);
    assert.equal(f.dados.has('ciclo_mensal_diario_c-1'), false);
  });
}

test('fila de anteriores que não grava impede a limpeza', async () => {
  const f = fixture(); f.ciclo(); f.leitura();
  f.deps.enfileirar = () => { throw new Error('Fila ilegível'); };
  await assert.rejects(f.abrir().processar(options()), /Fila ilegível/);
  assert.equal(f.dados.get('valor_c-1_A-101_agua'), '120');
  assert.equal(f.anteriores().length, 0);
});

test('trocar de conta durante o backup bloqueia promoção e limpeza', async () => {
  const f = fixture(); f.ciclo(); f.leitura();
  f.deps.arquivar = async () => f.trocarConta();
  await assert.rejects(f.abrir().processar(options()), /Conta mudou/);
  assert.equal(f.dados.get('valor_c-1_A-101_agua'), '120');
  assert.equal(f.anteriores().length, 0);
});

test('duas solicitações simultâneas executam um único fechamento', async () => {
  const f = fixture(); f.ciclo(); f.leitura(); const service = f.abrir();
  await Promise.all([service.processar(options()), service.processar(options())]);
  assert.equal(f.backups.length, 1);
  assert.equal(f.lotes.length, 1);
});

test('validação usa a leitura anterior canônica mesmo quando a unidade tem outro formato', async () => {
  const f = fixture(); f.ciclo(); f.leitura('AP-101');
  f.deps.obterAnterior = (condId, unidade, servico) => {
    assert.deepEqual([condId, unidade, servico], ['c-1', 'AP-101', 'agua']);
    return 130;
  };
  await assert.rejects(f.abrir().processar(options()), /menor/);
  assert.equal(f.dados.get('valor_c-1_AP-101_agua'), '120');
});

test('captura que termina durante o backup preserva os dados novos e replaneja sem enviar valores antigos', async () => {
  const f = fixture(); f.ciclo(); f.leitura();
  f.deps.arquivar = async () => f.leitura('B-202', 'gas', '88');
  await assert.rejects(f.abrir().processar(options()), /alterada/);
  assert.equal(f.lotes.length, 0);
  assert.equal(f.dados.get('valor_c-1_B-202_gas'), '88');
  assert.equal(f.dados.has('ciclo_mensal_diario_c-1'), false);
  f.deps.arquivar = async () => {};
  assert.equal((await f.abrir().processar(options())).promovidas, 2);
});
