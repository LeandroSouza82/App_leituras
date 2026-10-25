import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('.qa', { recursive:true });
await build({entryPoints:['scripts/ucondo-preview.jsx'],bundle:true,outfile:'.qa/preview.js',format:'iife',jsx:'automatic',plugins:[{
  name:'ucondo-preview-only',setup(plugin){
    plugin.onResolve({filter:/ucondoTransferService$/},()=>({path:'fixture',namespace:'preview'}));
    plugin.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:`
      let fotos=12;
      export const processarEnviosUcondo=async()=>{};
      export const consultarEnviosUcondo=async()=>({
        pedidos:[{id:'preview-transfer',user_id:'preview',condominio_nome:'Residencial dos Ipês',periodo:'2026-10',servicos:['AGUA'],total_leituras:20,trabalhos_ids:['preview-job'],solicitacao_id:'preview-batch',status:'despachada'}],
        trabalhos:[{id:'preview-job',user_id:'preview',total_unidades:20,status:'em_andamento',heartbeat_at:new Date().toISOString(),resultado_mensagem:'Leituras conferidas: 20/20 unidades. Fotos confirmadas: '+Math.min(fotos++,19)+'/20 unidades. Fotos: conferindo a próxima unidade.'}],
        lotes:[{id:'preview-batch',status:'em_andamento'}]
      });
    `}));
  },
}]});
await writeFile('.qa/index.html','<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia — envio uCondo</title><link rel="stylesheet" href="preview.css"><body style="margin:12px;background:#edf3f6"><div id="root"></div><script src="preview.js"></script></body></html>');
console.log('Prévia gerada em .qa; somente dados fictícios, sem acesso ao backend.');
