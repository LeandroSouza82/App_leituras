import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled=await build({stdin:{contents:"export * from './src/services/ucondoTransferService.js';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{
  name:'transfer-fixture',setup(plugin){
    plugin.onResolve({filter:/supabase$|syncService$|offlineQueueStorage$|networkQualityService$/},args=>({path:args.path,namespace:'fixture'}));
    plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>{
      const f='const f=globalThis.__transferFixture;';
      return {contents:f+(/supabase$/.test(args.path)?'export const supabase=f.supabase;export const criarClienteParaToken=()=>f.client;'
        :/syncService$/.test(args.path)?'export const salvarLeituraOffline=async i=>{f.uploads.push(i);return true};export const sincronizarFilaEmBackground=async()=>{};export const readFilaSync=()=>f.pendentes;'
        :/offlineQueueStorage$/.test(args.path)?'export const exigirContaOffline=id=>{id ??= f.user;if(id!==f.user)throw new Error("conta mudou");return id};export const capturarContextoSync=async()=>({client:f.client,assertActive:()=>{}});'
        :'export const temConexaoInternetUtil=async()=>f.online;')};
    });
  },
}]});
async function fixture(){
  const storage=new Map(); globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  globalThis.window={dispatchEvent(){}};
  const f={user:'A',online:false,uploads:[],calls:[],records:[],pendentes:[]};
  f.supabase={auth:{getSession:async()=>({data:{session:{user:{id:f.user},access_token:'fixture'}}})}};
  f.client={from(){const q={select(){return q},eq(){return q},in(){return Promise.resolve({data:f.records})}};return q},rpc:async(name,args)=>{f.calls.push({name,args});return {data:{id:'server-id'}}}};
  globalThis.__transferFixture=f;
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text+'\n// '+Math.random()).toString('base64'));
  const item={db_id:'reading',leiturista_id:'A',condominio_id:'condo',mes_referencia:'2026-10',unidade_id:'101',servico:'AGUA',condominio_nome:'Condo',leitura_atual:10,photoPath:'backup/photo.jpg'};
  f.input={userId:'A',condominioId:'condo',nome:'Condo',periodo:'2026-10',servicos:['AGUA'],itens:[item]};
  return {f,api,item};
}
test('offline click is durable; AWS is requested only after the photo and exact reading reach the server',async()=>{
  const {f,api,item}=await fixture();api.registrarEnvioUcondo(f.input);
  await api.processarEnviosUcondo('A');assert.equal(f.uploads.length,0);assert.equal(f.calls.length,0);
  f.online=true;await api.processarEnviosUcondo('A');assert.equal(f.uploads.length,1);assert.equal(f.calls.length,0);
  f.records=[{...item,id:item.db_id,foto_url:'https://fixture.test/foto'}];
  f.pendentes=[item];
  await api.processarEnviosUcondo('A');assert.equal(f.calls.length,0,'foto antiga no banco não confirma uma nova captura ainda pendente');
  f.pendentes=[{db_id:'outro-condominio'}];
  await api.processarEnviosUcondo('A');assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.p_condominio_id,'condo');
  await api.processarEnviosUcondo('A');assert.equal(f.calls.length,1);
});
test('leaving a condo and collecting another does not cancel or replace the first request',async()=>{
  const {f,api}=await fixture();const first=api.registrarEnvioUcondo(f.input);
  const second=api.registrarEnvioUcondo({...f.input,condominioId:'next',itens:[{...f.input.itens[0],db_id:'next',condominio_id:'next'}]});
  assert.notEqual(first.id,second.id);assert.equal(api.registrarEnvioUcondo(f.input).id,first.id);
  f.user='B';f.online=true;await assert.rejects(api.processarEnviosUcondo('A'));assert.equal(f.calls.length,0);
});

test('unidade explicitamente sem medidor envia zero sem foto e mantém a confirmação do servidor', async()=>{
  const {f,api,item}=await fixture();
  const dispensada={...item,sem_medidor:true,leitura_atual:0,photoPath:null};
  f.input.itens=[dispensada];
  api.registrarEnvioUcondo(f.input);
  f.online=true;
  f.records=[{...dispensada,id:dispensada.db_id,foto_url:''}];
  await api.processarEnviosUcondo('A');
  assert.equal(f.uploads[0].sem_medidor,true);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].name,'solicitar_transferencia_ucondo');
});

test('nome original pendente sincroniza no cadastro antes de solicitar a transferência', async()=>{
  const {f,api,item}=await fixture();
  api.registrarEnvioUcondo(f.input);
  globalThis.localStorage.setItem('nome_ucondo_planilha_A_condo','Hamburgo*');
  f.client.from=table=>{
    const q={update(patch){f.nome=patch;return q},select(){return q},eq(){return q},
      in(){return Promise.resolve({data:f.records})},
      then(resolve,reject){return Promise.resolve({data:[{id:'condo'}]}).then(resolve,reject)}};
    return q;
  };
  f.online=true;f.records=[{...item,id:item.db_id,foto_url:'https://fixture.test/foto'}];
  await api.processarEnviosUcondo('A');
  assert.deepEqual(f.nome,{nome_ucondo:'Hamburgo*'});
  assert.equal(globalThis.localStorage.getItem('nome_ucondo_planilha_A_condo'),null);
  assert.equal(f.calls.length,1);
});
