import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('.qa-guia', { recursive:true });
await build({entryPoints:['scripts/guia-preview.jsx'],bundle:true,outfile:'.qa-guia/guia.js',format:'iife',jsx:'automatic',plugins:[{
  name:'guia-preview-boundaries',setup(plugin){
    plugin.onResolve({filter:/syncService$|CustomPrompt$|CameraSettingsModal$|FeedbackModal$|PrivacyTermsModal$|^@capacitor\/(app|core|browser)$/},args=>({path:args.path,namespace:'guia-preview'}));
    plugin.onLoad({filter:/.*/,namespace:'guia-preview'},args=>({contents:
      /syncService$/.test(args.path)?'export const readFilaSync=()=>[];export const sincronizarFilaEmBackground=async()=>{};'
      :/CustomPrompt$/.test(args.path)?'export const customAlert=async()=>{};export const customConfirm=async()=>false;'
      :/browser$/.test(args.path)?'export const Browser={open:async({url})=>window.dispatchEvent(new CustomEvent("guia_link_aberto",{detail:url}))};'
      :/core$/.test(args.path)?'export const Capacitor={isNativePlatform:()=>false};'
      :/app$/.test(args.path)?'export const App={addListener:async()=>({remove(){}})};'
      :'export default function PreviewBoundary(){return null;}'
    }));
  },
}]});
await writeFile('.qa-guia/guia.html','<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guia do leiturista — conferência</title><link rel="stylesheet" href="guia.css"><body style="margin:0;font-family:system-ui;background:#edf3f7"><div id="root"></div><script src="guia.js"></script></body></html>');
await writeFile('.qa-guia/index.html','<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guia do leiturista — prévia em celular</title><body style="margin:0;background:#dce7ee;display:flex;justify-content:center"><iframe title="Aplicativo em tela de celular" src="guia.html" style="width:390px;height:760px;max-width:100%;border:0;background:white"></iframe></body></html>');
console.log('Prévia do menu e guia reais gerada; rede, conta e navegação externa simuladas.');
