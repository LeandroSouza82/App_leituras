import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairMetadadosPlanilha, encontrarCondominioDaPlanilha } from '../src/services/ucondoSpreadsheetMetadata.js';
import { confirmarEtapasTrabalho, progressoTransferencia, contarSincronizadas } from '../src/services/ucondoTransferModel.js';

test('nome original da planilha preserva asterisco, acentos e dois pontos', () => {
  for (const rows of [[['Condomínio: Hamburgo*']], [['Condomínio:', 'Hamburgo*']]]) {
    const meta = extrairMetadadosPlanilha(rows);
    assert.equal(meta.nome, 'Hamburgo');
    assert.equal(meta.nomeOficial, 'Hamburgo*');
  }
  assert.equal(extrairMetadadosPlanilha([['Condomínio: São José: Bloco A*']]).nomeOficial, 'São José: Bloco A*');
  assert.equal(extrairMetadadosPlanilha([['Sem nome']]).nomeOficial, '');
});

test('106 leituras e 102 fotos com quatro dispensas confirmadas concluem o envio', () => {
  const job = { id:'j', user_id:'A', status:'concluida', total_unidades:106, erros:0, pendencias:0,
    resultado_mensagem:'Fluxo completo concluído (AGUA): 106 unidades com leituras conferidas (102 fotos confirmadas, 4 marcadas sem foto).' };
  const pedido = { user_id:'A', servicos:['AGUA'], trabalhos_ids:['j'], total_leituras:106 };
  const view = progressoTransferencia(pedido,[job],{status:'concluido'});
  assert.equal(view.completo,true);
  assert.equal(view.percentual,100);
  assert.equal(view.fotos,102);
  assert.equal(view.semFoto,4);
  assert.equal(progressoTransferencia(pedido,[job],{status:'em_andamento'}).completo,false);
  assert.equal(confirmarEtapasTrabalho({...job, resultado_mensagem:job.resultado_mensagem.replace('4 marcadas','3 marcadas')}).completo,false);
  assert.equal(confirmarEtapasTrabalho({...job, pendencias:1}).completo,false);
});

test('dispensa explícita aceita zero sincronizado sem foto; zero comum permanece pendente', () => {
  const item={db_id:'d',leiturista_id:'A',servico:'AGUA',unidade_id:'01-0001',condominio_nome:'Hamburgo',leitura_atual:0};
  const row={...item,id:'d',foto_url:''};
  assert.equal(contarSincronizadas([item],[row]),0);
  assert.equal(contarSincronizadas([{...item,sem_medidor:true}],[row]),1);
  assert.equal(contarSincronizadas([{...item,sem_medidor:true}],[{...row,leitura_atual:1}]),0);
  assert.equal(contarSincronizadas([{...item,sem_medidor:true}],[{...row,leiturista_id:'B'}]),0);
});

test('associação de condomínio usa correspondência exata única, sem nomes parecidos', () => {
  const c={id:'a',nome:'São Bento',nome_ucondo:null};
  assert.equal(encontrarCondominioDaPlanilha([c], ' SÃO   BENTO* '),c);
  assert.equal(encontrarCondominioDaPlanilha([{nome:'São Bento II'}], 'São Bento'),null);
  assert.equal(encontrarCondominioDaPlanilha([{nome:'A-B'}], 'AB'),null);
  assert.throws(()=>encontrarCondominioDaPlanilha([c,{nome:'Sao Bento*'}],'São Bento'), /duplicados/);
});
