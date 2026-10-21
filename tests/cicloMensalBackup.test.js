import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  stdin: { contents: "export { criarArquivoCiclo } from './src/services/cicloMensalService.js';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'ciclo-test-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /syncOfflineService\.js$|supabase\.js$|networkQualityService\.js$/ }, args => ({ path: args.path, namespace: 'ciclo-test' }));
    plugin.onLoad({ filter: /.*/, namespace: 'ciclo-test' }, args => ({ contents: args.path.endsWith('supabase.js')
      ? 'export const supabase=null;' : args.path.endsWith('networkQualityService.js') ? 'export const temConexaoInternetUtil=async()=>false;' : 'export const enfileirarLeiturasAnteriores=()=>{};' }));
  } }],
});
const { criarArquivoCiclo } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const fixture = () => {
  const disco = new Map([
    ['DATA/Backups/Sao_Bento/AptoA-101_AGUA.jpg', 'foto permanente'],
    ['CACHE/FastLeituras/Sao_Bento/AptoB-201_GAS.jpg', 'foto legada cache'],
    ['DATA/leitura_foto_c-1_C-301_ENERGIA.jpg', 'foto legada raiz'],
  ]);
  const pastas = new Set(['DATA/', 'CACHE/FastLeituras/Sao_Bento']);
  const arquivos = {
    async readdir({ path, directory }) {
      const key = `${directory}/${path}`;
      if (!pastas.has(key)) throw new Error('Folder does not exist');
      return { files: [...disco.keys()].filter(k => k.startsWith(key + (path ? '/' : '')))
        .map(k => k.slice(key.length + (path ? 1 : 0))).filter(name => !name.includes('/')).map(name => ({ name })) };
    },
    async mkdir({ path, directory }) { const key = `${directory}/${path}`; if (pastas.has(key)) throw new Error('Directory exists'); pastas.add(key); },
    async stat({ path, directory }) { const data = disco.get(`${directory}/${path}`); if (data === undefined) throw new Error('File does not exist'); return { size: data.length }; },
    async copy({ from, to, directory, toDirectory }) { const data = disco.get(`${directory}/${from}`); if (data === undefined) throw new Error('File does not exist'); disco.set(`${toDirectory}/${to}`, data); },
    async writeFile({ path, data, directory }) { disco.set(`${directory}/${path}`, data); },
    async readFile({ path, directory }) { return { data: disco.get(`${directory}/${path}`) }; },
  };
  const plano = { owner: 'conta-A', condId: 'c-1', origem: '2026-10', id: 'ciclo-unico', incluirLegado: true,
    condominio: { nome: 'Sao Bento' }, dados: { 'valor_c-1_A-101_agua': '120', 'foto_path_c-1_A-101_agua': 'Backups/Sao_Bento/AptoA-101_AGUA.jpg' } };
  return { disco, arquivos, plano };
};

test('arquiva fotos permanentes e legadas, com relatório dos valores e caminhos, sem apagar originais nem enviá-los', async () => {
  const f = fixture(); const original = new Map(f.disco);
  await criarArquivoCiclo(f.arquivos)(f.plano);
  for (const [key, value] of original) assert.equal(f.disco.get(key), value);
  const relatorio = JSON.parse(f.disco.get('DATA/Ciclos/conta-A/c-1/2026-10/ciclo-unico.json'));
  assert.equal(relatorio.fotosArquivadas.length, 3);
  assert.equal(relatorio.dados['valor_c-1_A-101_agua'], '120');
  assert.equal(f.disco.get('DATA/Backups/Sao_Bento_2026-10_ciclo-unico/AptoA-101_AGUA.jpg'), 'foto permanente');
});

test('retomada utiliza a mesma pasta e funciona quando o backup já existe', async () => {
  const f = fixture(); const arquivar = criarArquivoCiclo(f.arquivos);
  await arquivar(f.plano); const antes = new Map(f.disco);
  await arquivar(f.plano);
  assert.deepEqual(f.disco, antes);
});

test('não reimporta fotos legadas de meses já finalizados', async () => {
  const f = fixture(); f.plano.incluirLegado = false;
  await criarArquivoCiclo(f.arquivos)(f.plano);
  const relatorio = JSON.parse(f.disco.get('DATA/Ciclos/conta-A/c-1/2026-10/ciclo-unico.json'));
  assert.equal(relatorio.fotosArquivadas.length, 1);
});

test('falhas de cópia ou confirmação do relatório impedem o fechamento', async () => {
  for (const tipo of ['copia', 'relatorio']) {
    const f = fixture();
    if (tipo === 'copia') f.arquivos.copy = async ({ to, toDirectory }) => f.disco.set(`${toDirectory}/${to}`, '');
    else f.arquivos.readFile = async () => ({ data: 'incompleto' });
    await assert.rejects(criarArquivoCiclo(f.arquivos)(f.plano), /não foi confirmad/);
    assert.equal(f.disco.get('DATA/Backups/Sao_Bento/AptoA-101_AGUA.jpg'), 'foto permanente');
  }
});
