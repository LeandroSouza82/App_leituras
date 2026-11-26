import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { gerarPlanilhaEquipe } from '../src/services/planilhaEquipe.js';

const modelo = await readFile(new URL('../public/modelos/ucondo-consumos.xlsx', import.meta.url));
async function linhasConsumos(bytes) {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(bytes);
  return livro.worksheets.map(aba => [aba.name, aba.getSheetValues().slice(1).filter(linha => linha?.[1] != null).map(linha => linha.slice(1, 3))]);
}

const cond = { id: 'equipe', nome: 'Dona Cacilda', tipoLeitura: 'Água, Gás e Energia', compartilhado: true };
const proprio = { id: 'proprio', nome: 'Dona Cacilda', compartilhado: false };

async function carregar(dados) {
  const consultas = [];
  const rpcs = [];
  const cache = new Map();
  function consulta(tabela) {
    const filtros = [];
    const periodo = {};
    const api = {
      select: () => api, order: () => api, or: () => api,
      eq: (campo, valor) => { filtros.push([campo, [valor]]); return api; },
      in: (campo, valores) => { filtros.push([campo, valores]); return api; },
      gte: (campo, valor) => { periodo.inicio = [campo, valor]; return api; },
      lt: (campo, valor) => { periodo.fim = [campo, valor]; return api; },
      async range(inicio, fim) {
        consultas.push({ tabela, filtros, periodo });
        const linhas = (dados[tabela] || []).filter(row => filtros.every(([campo, valores]) => valores.includes(row[campo])));
        return { data: linhas.slice(inicio, fim + 1), error: null };
      },
    };
    return api;
  }
  globalThis.__dadosEquipeFluxo = {
    client: {
      from: consulta,
      rpc: async (nome, args) => { rpcs.push([nome,args]); return { data: nome === 'equipe_criar_convite' ? 'a'.repeat(64) : true }; },
      storage: { from: (bucket) => ({
        async download(caminho) {
          assert.equal(bucket, 'fotos_leituras');
          assert.equal(caminho, 'leituras/unidade.jpg');
          return { data: new Blob(['foto simulada'], {type:'image/jpeg'}), error: null };
        },
      }) },
    },
    condominios: [proprio, cond],
  };
  globalThis.localStorage = {
    getItem: chave => cache.get(chave) ?? null,
    setItem: (chave, valor) => cache.set(chave, valor),
  };
  const resultado = await build({
    stdin: {
      contents: "export * from './src/services/equipeService.js'; export * from './src/services/restauracaoOfflineService.js';",
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'esm',
    define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://banco.test"' },
    plugins: [{ name: 'equipe-teste', setup(plugin) {
      plugin.onResolve({filter: /^\.\/(?:supabase(?:\.js)?|filesystemService\.js|networkQualityService\.js|condominioService\.js)$/}, args =>
        ({path:args.path,namespace:'fake'}));
      plugin.onLoad({filter: /.*/, namespace: 'fake'}, ({path}) => ({ contents:
        path.includes('supabase') ? 'export const supabase = globalThis.__dadosEquipeFluxo.client;'
        : path.includes('filesystemService') ? 'export const salvarArquivoSeguro = async () => {};'
        : path.includes('networkQualityService') ? 'export const temConexaoInternetUtil = async () => true;'
        : 'export const buscarCondominios = async () => globalThis.__dadosEquipeFluxo.condominios;',
      }));
    } }],
  });
  const app = await import('data:text/javascript;base64,' + Buffer.from(resultado.outputFiles[0].text + '\n// ' + crypto.randomUUID()).toString('base64'));
  return { app, consultas, rpcs, cache };
}

test('valida todos os serviços, dispensa e zero antes de emitir convite com os IDs certos', async () => {
  const mes = new Date().toLocaleDateString('sv-SE').slice(0,7);
  const base = {
    unidades: [{ condominio_id:'equipe', nome:'101', servicos_sem_medidor:['GAS'] }],
    unidades_leituras: [{ condominio_nome:'equipe', unidade:'101', servico:'AGUA', leitura_anterior:0, mes_referencia:mes }],
  };
  const {app,rpcs} = await carregar(base);
  await assert.rejects(app.criarConviteEquipe([cond]), /Dona Cacilda.*sem leitura anterior/);
  assert.deepEqual(rpcs, []);
  base.unidades_leituras.push({ condominio_nome:'equipe', unidade:'101', servico:'ENERGIA', leitura_anterior:12.3, mes_referencia:mes });
  const link = await app.criarConviteEquipe([cond]);
  assert.match(link, /\/convite#token=/);
  assert.deepEqual(rpcs,[['equipe_criar_convite',{p_condominios:['equipe']}]]);
});

test('conta simulada sem cache recebe a planilha do ID compartilhado e nunca usa a medição atual como anterior', async () => {
  const mes = new Date().toLocaleDateString('sv-SE').slice(0,7);
  const {app,cache} = await carregar({
    unidades: [{condominio_id:'equipe',numero:'101'},{condominio_id:'proprio',numero:'202'}],
    leituras_detalhes: [{condominio_id:'equipe',condominio_nome:'Dona Cacilda',unidade_id:'101',servico:'AGUA',leitura_atual:400}],
    unidades_leituras: [
      {condominio_nome:'equipe',unidade:'101',servico:'AGUA',leitura_anterior:4,mes_referencia:'2025-01'},
      {condominio_nome:'equipe',unidade:'101',servico:'AGUA',leitura_anterior:0,mes_referencia:mes},
      {condominio_nome:'equipe',unidade:'101',servico:'ENERGIA',leitura_anterior:12.3,mes_referencia:mes},
      {condominio_nome:'proprio',unidade:'202',servico:'GAS',leitura_anterior:18,mes_referencia:mes},
    ],
  });
  const resultado = await app.restaurarDadosParaUsoOffline({userId:'membro'});
  assert.equal(resultado.restaurados,2);
  assert.deepEqual(JSON.parse(cache.get('unidades_equipe')),['101']);
  assert.deepEqual(JSON.parse(cache.get('leituras_anteriores_equipe_AGUA')),[{unidade:'101',leitura_anterior:0}]);
  assert.deepEqual(JSON.parse(cache.get('leituras_anteriores_equipe_ENERGIA')),[{unidade:'101',leitura_anterior:12.3}]);
  assert.equal(cache.has('leituras_anteriores_equipe_GAS'),false);
});

test('consulta por condomínio e autor, abre a foto pela sessão e exporta no formato do uCondo', async () => {
  const fotoUrl = 'https://banco.test/storage/v1/object/public/fotos_leituras/leituras/unidade.jpg';
  const principal = {id:'r1',condominio_id:'equipe',leiturista_id:'dionatan',unidade_id:'101',servico:'GAS',leitura_atual:0,foto_url:fotoUrl,data_leitura:'2026-11-13T12:30:00Z'};
  const {app,consultas} = await carregar({ unidades:[{condominio_id:'equipe',numero:'101'}], leituras_detalhes:[principal,{...principal,id:'r2',condominio_id:'outro'},{...principal,id:'r3',leiturista_id:'outra'}] });
  const resultado = await app.buscarLeiturasEquipe('equipe','dionatan','2026-11');
  assert.deepEqual(resultado,[{...principal,dispensada:false}]);
  assert.deepEqual(consultas[0].filtros,[['condominio_id',['equipe']],['leiturista_id',['dionatan']]]);
  assert.deepEqual(consultas[0].periodo,{inicio:['data_leitura','2026-11-01T03:00:00.000Z'],fim:['data_leitura','2026-12-01T03:00:00.000Z']});
  const foto = await app.abrirFotoEquipe(fotoUrl);
  assert.equal(await (await fetch(foto)).text(),'foto simulada');
  URL.revokeObjectURL(foto);
  await assert.rejects(app.abrirFotoEquipe(fotoUrl.replace('banco.test','fora.test')),/Endereço de foto inválido/);
  assert.deepEqual(await linhasConsumos(await gerarPlanilhaEquipe(await app.listarUnidadesEquipe('equipe'),resultado,'gas',modelo)),
    [['Consumos',[['Unidade *','Leitura atual *'],['101','0.0000']]]]);
});

test('marca como dispensada só a unidade sem medidor naquele serviço e sem foto', async () => {
  const base = {condominio_id:'equipe',leiturista_id:'dionatan',leitura_atual:0,foto_url:null,data_leitura:'2026-11-13T12:30:00Z'};
  const {app} = await carregar({
    unidades: [
      {condominio_id:'equipe',numero:'LOJA-001',servicos_sem_medidor:['GAS']},
      {condominio_id:'equipe',nome:' AP-101 ',servicos_sem_medidor:['AGUA']},
      {condominio_id:'outro',numero:'LOJA-002',servicos_sem_medidor:['GAS']},
    ],
    leituras_detalhes: [
      {...base,id:'l1',unidade_id:'LOJA-001',servico:'GAS'},
      {...base,id:'l2',unidade_id:'AP-101',servico:'GAS'},
      {...base,id:'l3',unidade_id:'LOJA-002',servico:'GAS'},
      {...base,id:'l4',unidade_id:'AP-101',servico:'agua'},
    ],
  });
  const resultado = await app.buscarLeiturasEquipe('equipe','dionatan','2026-11');
  assert.deepEqual(resultado.map(l => [l.id,l.dispensada]),[['l1',true],['l2',false],['l3',false],['l4',true]]);
  assert.deepEqual(await linhasConsumos(await gerarPlanilhaEquipe(await app.listarUnidadesEquipe('equipe'),resultado,'gas',modelo)),
    [['Consumos',[['Unidade *','Leitura atual *'],['AP-101','0.0000'],['LOJA-001','0.0000']]]]);
});
