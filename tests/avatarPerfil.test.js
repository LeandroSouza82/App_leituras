import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { criarAvatarPerfilService } from '../src/services/avatarPerfilService.js';

const url = 'https://lh3.googleusercontent.com/a/foto=s96-c';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=';
const imagem = `data:image/png;base64,${png}`;
const fixture = () => {
  const dados = new Map();
  const chamadas = [];
  const storage = { getItem: k => dados.get(k) || null, setItem: (k, v) => dados.set(k, v), removeItem: k => dados.delete(k) };
  const http = { get: async opcoes => {
    chamadas.push(opcoes);
    return { status: 200, headers: { 'Content-Type': 'image/png' }, data: png };
  } };
  return { dados, chamadas, storage, http, service: criarAvatarPerfilService({ storage, http, nativo: () => true }) };
};

test('tela completa do Perfil renderiza formulário e avatar sem erro de referência', async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
        import Perfil from './src/pages/Perfil/Perfil.jsx';
        export const render = () => renderToStaticMarkup(<Perfil onShowToast={() => {}} />);`,
      resolveDir: process.cwd(), loader: 'jsx',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom/*', '@capacitor/core'],
    loader: { '.css': 'empty' },
    plugins: [{ name: 'perfil-sem-rede', setup(plugin) {
      plugin.onResolve({ filter: /\/services\/supabase$|\/CustomPrompt\/CustomPrompt$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        contents: path.endsWith('supabase') ? 'export const supabase = null;' : 'export const customConfirm = async () => false;',
      }));
    } }],
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const html = mod.exports.render();
  assert.match(html, /Dados operacionais/);
  assert.match(html, /Nome completo/);
  assert.match(html, /Salvar dados/);
  assert.match(html, /perfil-avatar/);
});

test('baixa pelo Android, sem tokens, com prazo e guarda a foto por conta', async () => {
  const f = fixture();
  assert.equal(await f.service.carregar('A', url), imagem);
  assert.deepEqual(f.chamadas[0], { url, responseType: 'arraybuffer', connectTimeout: 8000, readTimeout: 8000, disableRedirects: true });
  assert.equal(await f.service.carregar('A', url), imagem);
  assert.equal(f.chamadas.length, 1);
});

test('foto em cache funciona offline, incluindo nova tentativa sem rede', async () => {
  const f = fixture();
  await f.service.carregar('A', url);
  f.http.get = async () => { throw new Error('offline'); };
  assert.equal(await f.service.carregar('A', url), imagem);
  assert.equal(await f.service.carregar('A', url, { atualizar: true }), imagem);
});

test('não mostra foto da conta anterior ou de uma URL substituída', async () => {
  const f = fixture();
  await f.service.carregar('A', url);
  f.http.get = async () => { throw new Error('offline'); };
  assert.equal(await f.service.carregar('B', url), url);
  assert.equal(await f.service.carregar('A', `${url}-nova`), `${url}-nova`);
});

test('erro de rede, erro HTTP e resposta que não é imagem usam a URL alternativa', async () => {
  for (const resposta of [null, { status: 429, data: png, headers: { 'content-type': 'image/png' } },
    { status: 200, data: 'não é imagem', headers: { 'content-type': 'text/html' } },
    { status: 200, data: 'A'.repeat(350001), headers: { 'content-type': 'image/png' } }]) {
    const f = fixture();
    f.http.get = async () => { if (!resposta) throw new Error('rede'); return resposta; };
    assert.equal(await f.service.carregar('A', url), url);
    assert.equal(f.dados.size, 0);
  }
});

test('cache ilegível e armazenamento cheio não quebram o carregamento', async () => {
  const storage = { getItem: () => '{inválido', setItem: () => { throw new Error('quota'); } };
  const f = fixture();
  const service = criarAvatarPerfilService({ storage, http: f.http, nativo: () => true });
  assert.equal(await service.carregar('A', url), imagem);
});

test('não usa rede nativa para endereços estranhos nem renderiza protocolo inseguro', async () => {
  const f = fixture();
  for (const endereco of ['http://lh3.googleusercontent.com/a', 'javascript:alert(1)', 'https://user:senha@lh3.googleusercontent.com/a', 'inválido']) {
    assert.equal(await f.service.carregar('A', endereco), null);
  }
  const outra = 'https://foto.example/imagem.png';
  assert.equal(await f.service.carregar('A', outra), outra);
  assert.equal(f.chamadas.length, 0);
});

test('cache inválido é ignorado e pode ser removido sem afetar outras contas', async () => {
  const f = fixture();
  f.dados.set('fastleituras_avatar_v1_A', JSON.stringify({ url, data: 'data:text/html;base64,SGk=' }));
  assert.equal(await f.service.carregar('A', url), imagem);
  await f.service.carregar('B', url);
  f.service.limpar('A');
  assert.equal(f.dados.has('fastleituras_avatar_v1_A'), false);
  assert.equal(f.dados.has('fastleituras_avatar_v1_B'), true);
});
