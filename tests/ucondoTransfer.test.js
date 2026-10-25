import test from 'node:test';
import assert from 'node:assert/strict';
import { progressoTransferencia, confirmarEtapasTrabalho, contarSincronizadas, lerEnvios, gravarEnvios } from '../src/services/ucondoTransferModel.js';

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
