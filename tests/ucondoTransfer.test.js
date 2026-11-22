import test from 'node:test';
import assert from 'node:assert/strict';
import { progressoTransferencia, confirmarEtapasTrabalho, contarSincronizadas, lerEnvios, gravarEnvios, separarHistoricoTransferencias } from '../src/services/ucondoTransferModel.js';

const pedido = { user_id: 'A', servicos: ['AGUA'], trabalhos_ids: ['job'], total_leituras: 20, status: 'despachada' };
const job = { id: 'job', user_id: 'A', total_unidades: 20, status: 'em_andamento', heartbeat_at: new Date().toISOString(),
  resultado_mensagem: 'Leituras conferidas: 20/20 unidades. Fotos confirmadas: 12/20 unidades. Fotos: conferindo a foto da unidade 13.' };

test('shows confirmed 12/20 photos while the next one is only being verified', () => {
  const p = progressoTransferencia(pedido,[job],{ status:'em_andamento' });
  assert.equal(p.fotos,12); assert.equal(p.leituras,20); assert.equal(p.percentual,80);
  assert.match(p.etapa,/fotos/); assert.equal(p.completo,false);
});
test('lost heartbeat preserves confirmed counters without declaring completion', () => {
  const p=progressoTransferencia(pedido,[{...job,heartbeat_at:'2000-01-01T00:00:00Z'}],{status:'em_andamento'});
  assert.match(p.etapa,/Sem atualização/); assert.equal(p.fotos,12); assert.equal(p.completo,false);
});
test('100% requires both stage evidence and final batch completion', () => {
  const completo={...job,status:'concluida',resultado_mensagem:'Fluxo completo concluído (AGUA): 20 unidades com leituras conferidas (20 fotos confirmadas, 0 marcadas sem foto).'};
  assert.equal(progressoTransferencia(pedido,[completo],{status:'em_andamento'}).percentual,99);
  assert.equal(progressoTransferencia(pedido,[completo],{status:'concluido'}).percentual,100);
  assert.equal(progressoTransferencia(pedido,[{...completo,resultado_mensagem:'Enviado!'}],{status:'concluido'}).completo,false);
  assert.equal(progressoTransferencia(pedido,[{...completo,user_id:'B'}],{status:'concluido'}).completo,false);
});
test('a partial or failed service never makes an entire mixed condo complete', () => {
  const p={...pedido,servicos:['AGUA','GAS'],trabalhos_ids:['job','gas'],total_leituras:40};
  const view=progressoTransferencia(p,[job,{...job,id:'gas',status:'erro'}],{status:'erro'});
  assert.equal(view.completo,false); assert.equal(view.falhou,true); assert.ok(view.percentual<100);
  assert.equal(confirmarEtapasTrabalho({...job,resultado_mensagem:'Fotos: preparando arquivos 20/20.'}).fotos,null);
});
test('Khiva: cinco lojas fora da grade contam como dispensas, não como leituras ou fotos', () => {
  const p = { ...pedido, total_leituras: 26, servicos: ['AGUA', 'GAS'], trabalhos_ids: ['job', 'gas'] };
  const agua = { ...job, status: 'concluida', total_unidades: 13,
    resultado_mensagem: 'Fluxo completo concluído (AGUA): 13 unidades com leituras conferidas (13 fotos confirmadas, 0 marcadas sem foto).' };
  const gas = { ...agua, id: 'gas',
    resultado_mensagem: 'Fluxo completo concluído (GAS): 8 unidades com leituras conferidas (8 fotos confirmadas, 5 marcadas sem foto). Unidades sem medidor fora da grade: LOJA-001, LOJA-002, LOJA-003, LOJA-004, LOJA-005.' };
  const lote = { status: 'concluido' };
  const resultado = progressoTransferencia(p, [agua, gas], lote);
  assert.equal(resultado.percentual, 100);
  assert.equal(resultado.leituras, 21);
  assert.equal(resultado.fotos, 21);
  assert.equal(resultado.foraGrade, 5);
  assert.equal(resultado.semFoto, 5);
  assert.equal(progressoTransferencia(p, [agua, { ...gas,
    resultado_mensagem: gas.resultado_mensagem.replace('LOJA-005.', 'LOJA-004.') }], lote).completo, false);
});

test('San Sebastian: conclusão comprovada no trabalho retomado supera erro do lote anterior', () => {
  const p = { ...pedido, total_leituras: 56, servicos: ['GAS'] };
  const concluido = { ...job, status: 'concluida', total_unidades: 56, erros: 0, pendencias: 0,
    resultado_mensagem: 'Fluxo completo concluído (GAS): 56 unidades com leituras conferidas (56 fotos confirmadas, 0 marcadas sem foto).' };
  const lote = { status: 'erro' };
  const resultado = progressoTransferencia(p, [concluido], lote);
  assert.equal(resultado.percentual, 100);
  assert.equal(resultado.falhou, false);
  assert.equal(progressoTransferencia(p, [{ ...concluido, pendencias: 1 }], lote).falhou, true);
  assert.equal(progressoTransferencia(p, [{ ...concluido, status: 'em_andamento' }], lote).completo, false);
});

test('Le Parque: mantém o progresso real na retomada e encerra em 100% sem carregar o erro antigo', () => {
  const p = { ...pedido, servicos: ['AGUA', 'GAS'], trabalhos_ids: ['job', 'gas'], total_leituras: 96 };
  const loteOriginal = { status: 'erro' };
  const agua = { ...job, servico: 'AGUA', status: 'concluida', total_unidades: 48, erros: 0, pendencias: 0,
    resultado_mensagem: 'Fluxo completo concluído (AGUA): 48 unidades com leituras conferidas (48 fotos confirmadas, 0 marcadas sem foto).' };
  const gas = { ...agua, id: 'gas', servico: 'GAS', status: 'erro', erros: 1, erro_mensagem: 'Janela da foto APTO-1204',
    resultado_mensagem: 'Leituras conferidas: 48/48 unidades. Fotos confirmadas: 47/48 unidades.' };
  const antes = progressoTransferencia(p, [agua, gas], loteOriginal);
  assert.equal(antes.falhou, true);
  assert.equal(antes.fotos, 95);

  const aguardando = progressoTransferencia(p, [agua, { ...gas, status: 'aguardando' }], loteOriginal);
  assert.equal(aguardando.etapa, 'Aguardando o robô');
  assert.equal(aguardando.falhou, false);
  assert.equal(aguardando.percentual, 99);

  const executando = progressoTransferencia(p, [agua, { ...gas, status: 'em_andamento' }], loteOriginal);
  assert.equal(executando.etapa, 'Enviando e conferindo fotos');
  assert.equal(executando.falhou, false);
  assert.equal(executando.fotos, 95);

  const final = progressoTransferencia(p, [agua, { ...gas, status: 'concluida', erros: 0,
    resultado_mensagem: 'Fluxo completo concluído (GAS): 48 unidades com leituras conferidas (48 fotos confirmadas, 0 marcadas sem foto).' }], loteOriginal);
  assert.deepEqual([final.leituras, final.fotos, final.percentual, final.completo, final.falhou], [96, 96, 100, true, false]);
});

test('Catarina concluído em outra execução aparece como concluído com evidência dos mesmos apartamentos', () => {
  const p = { ...pedido, id: 'catarina', servicos: ['GAS'], total_leituras: 9 };
  const falho = { ...job, servico: 'GAS', status: 'erro', total_unidades: 9, resultado_mensagem: '' };
  const resultado = progressoTransferencia(p, [falho], { status: 'erro' }, 0, [{ servico: 'GAS', total: 9, externas: 9 }]);
  assert.deepEqual([resultado.etapa, resultado.leituras, resultado.fotos, resultado.percentual], ['Concluído no uCondo', 9, 9, 100]);
  assert.equal(resultado.tentativaResolvida, true);
  assert.equal(resultado.falhou, false);
  assert.deepEqual(separarHistoricoTransferencias([resultado]), { historico: [resultado], atuais: [] });
});

test('cobertura parcial mantém pendência e evita nova execução integral daquele serviço', () => {
  const p = { ...pedido, servicos: ['GAS'], total_leituras: 9 };
  const falho = { ...job, servico: 'GAS', status: 'erro', total_unidades: 9, resultado_mensagem: '' };
  const resultado = progressoTransferencia(p, [falho], { status: 'erro' }, 0, [{ servico: 'GAS', total: 9, externas: 5 }]);
  assert.deepEqual([resultado.leituras, resultado.fotos, resultado.percentual], [5, 5, 55]);
  assert.equal(resultado.falhou, true);
  assert.equal(resultado.completo, false);
  assert.equal(resultado.bloqueiaRetomada, true);
  assert.deepEqual(separarHistoricoTransferencias([resultado]).atuais, [resultado]);
});

test('um card concluído para o mesmo serviço não esconde uma falha sem evidência das unidades', () => {
  const base = { condominioId: 'catarina', periodo: '2026-11', servicos: ['GAS'] };
  const concluido = { ...base, completo: true };
  const falho = { ...base, falhou: true };
  assert.deepEqual(separarHistoricoTransferencias([concluido, falho]), { historico: [concluido], atuais: [falho] });
});

test('upload confirmation matches account, unit, service and numeric reading', () => {
  const item={db_id:'id',leiturista_id:'A',unidade_id:'101',servico:'AGUA',condominio_nome:'Condomínio A',leitura_atual:12.3456};
  const row={...item,id:'id',foto_url:'https://example.test/photo'};
  assert.equal(contarSincronizadas([item],[row]),1);
  assert.equal(contarSincronizadas([item],[{...row,leitura_atual:13}]),0);
  assert.equal(contarSincronizadas([item],[{...row,leiturista_id:'B'}]),0);
  assert.equal(contarSincronizadas([item],[{...row,foto_url:''}]),0);
});
test('different condos can remain queued independently and unreadable storage is preserved', () => {
  const map=new Map(); const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  const data=[{id:'one',userId:'A',condominioId:'one'},{id:'two',userId:'A',condominioId:'two'}];
  gravarEnvios('A',data,storage); assert.equal(lerEnvios('A',storage).length,2);
  assert.deepEqual(lerEnvios('B',storage),[]);
  map.set('fastleituras_envios_ucondo_v1_A','broken');
  assert.throws(()=>lerEnvios('A',storage));
  assert.equal(map.get('fastleituras_envios_ucondo_v1_A'),'broken');
});

test('Khiva conclui com 13 leituras de Água, 8 de Gás e 5 dispensas de Gás', () => {
  const p = { ...pedido, servicos: ['AGUA', 'GAS'], trabalhos_ids: ['job', 'gas'], total_leituras: 26 };
  const agua = { ...job, servico: 'AGUA', status: 'concluida', total_unidades: 13,
    resultado_mensagem: 'Fluxo completo concluído (AGUA): 13 unidades com leituras conferidas (13 fotos confirmadas, 0 marcadas sem foto).' };
  const gas = { ...job, id: 'gas', servico: 'GAS', status: 'erro', total_unidades: 13, resultado_mensagem: '' };
  const view = progressoTransferencia(p, [agua, gas], { status: 'erro' }, 0,
    [{ servico: 'GAS', total: 13, externas: 8, dispensadas: 5 }]);
  assert.deepEqual([view.leituras, view.fotos, view.foraGrade, view.semFoto, view.percentual], [21, 21, 5, 5, 100]);
  assert.equal(view.completo, true);
  assert.equal(view.tentativaResolvida, true);
  assert.equal(view.falhou, false);
});

test('cadastro divergente não oferece repetição automática nem inventa conclusão', () => {
  const estado = progressoTransferencia(pedido, [{...job, servico:'AGUA', status:'erro',
    resultado_mensagem: "Erro técnico: Checkpoint do trabalho possui 'condominio_nome_ucondo' divergente. Exige reconciliação."}], {status:'erro'});
  assert.equal(estado.completo,false);
  assert.equal(estado.exigeConferencia,true);
  assert.equal(estado.bloqueiaRetomada,true);
  assert.equal(estado.etapa,'Conferência necessária');
  assert.match(estado.detalhe,/Conclusão não confirmada/);
});

test('conclusão comprovada em outro manifesto encerra a falha, incluindo fotos dispensadas', () => {
  const p={...pedido,total_leituras:106};
  const estado=progressoTransferencia(p,[{...job,servico:'AGUA',status:'erro'}],{status:'erro'},Date.now(),
    [{servico:'AGUA',total:106,externas:102,dispensadas:4}]);
  assert.equal(estado.completo,true);
  assert.equal(estado.falhou,false);
  assert.equal(estado.percentual,100);
  assert.equal(estado.semFoto,4);
  assert.equal(estado.etapa,'Concluído no uCondo');
});
