import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { abrirConviteAndroid, APP_ANDROID, lerTokenConvite, linkConvite, ouvirConvitesAndroid, URL_CONVITE, urlApkOficial } from '../src/services/conviteEquipe.js';

const token = 'a'.repeat(64);

test('o link novo e o link antigo preservam o mesmo convite para o Android', () => {
  const convite = linkConvite(token);
  assert.equal(new URL(convite).search, '');
  assert.equal(lerTokenConvite(convite), token);
  assert.equal(lerTokenConvite(convite.replace('#', '?')), token);
  assert.equal(lerTokenConvite(convite.replace('#token=', '#convite=')), token);
  assert.equal(lerTokenConvite(convite.replace('/convite#', '/convite/#')), token);
  const [destino, dadosIntent] = abrirConviteAndroid(token).split('#Intent;');
  assert.equal(lerTokenConvite(destino.replace('intent:', 'com.fastleituras.app:')), token);
  assert.ok(dadosIntent.includes('package=com.fastleituras.app;'));
  assert.ok(dadosIntent.includes('S.browser_fallback_url=' + encodeURIComponent(convite)));
});

test('convite ignora páginas externas, login, tokens inválidos e caminhos diferentes', () => {
  for (const local of [
    'https://outro.appviper.com.br/convite',
    'https://fastleitura.appviper.com.br/app',
    'com.fastleituras.app://auth-callback/',
    'com.fastleituras.app://convite/arquivo',
  ]) assert.equal(lerTokenConvite(local + '?token=' + token), null);
  assert.equal(lerTokenConvite('com.fastleituras.app://convite?token=invalido'), null);
  assert.throws(() => linkConvite('invalido'));
});

test('download usa somente endereço HTTPS sem credenciais', () => {
  assert.equal(urlApkOficial('https://app.example/Fast-Leituras.apk'), 'https://app.example/Fast-Leituras.apk');
  assert.equal(urlApkOficial('https://foo:bar@app.example/arquivo.apk'), null);
  assert.equal(urlApkOficial('http://app.example/arquivo.apk'), null);
  assert.equal(urlApkOficial(''), null);
});

test('o Android associa somente a rota HTTPS de convites ao pacote assinado', async () => {
  const manifest = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const filtro = manifest.match(/<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/)?.[1];
  assert.ok(filtro);
  assert.match(filtro, /android\.intent\.action\.VIEW/);
  assert.match(filtro, /android\.intent\.category\.BROWSABLE/);
  assert.match(filtro, /android\.intent\.category\.DEFAULT/);
  const convite = new URL(URL_CONVITE);
  const urls = Array.from(filtro.matchAll(/<data android:scheme="(.*?)" android:host="(.*?)" android:path="(.*?)"\s*\/>/g),
    ([, esquema, host, caminho]) => `${esquema}://${host}${caminho}`);
  assert.deepEqual(urls, [convite.href, `${convite.href}/`]);

  const declaracoes = JSON.parse(await readFile(new URL('../public/.well-known/assetlinks.json', import.meta.url), 'utf8'));
  assert.deepEqual(declaracoes[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(declaracoes[0].target.namespace, 'android_app');
  assert.equal(declaracoes[0].target.package_name, APP_ANDROID);
  assert.match(declaracoes[0].target.sha256_cert_fingerprints[0], /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

test('Android simulado entrega App Link HTTPS com o app fechado e com o app aberto', async () => {
  const recebidos = [];
  const outrosLinks = [];
  let abrir;
  let removido = false;
  const segundoToken = 'b'.repeat(64);
  const app = {
    async addListener(evento, callback) {
      assert.equal(evento, 'appUrlOpen');
      abrir = callback;
      return { remove: () => { removido = true; } };
    },
    async getLaunchUrl() { return { url: linkConvite(token) }; },
  };
  const cancelar = ouvirConvitesAndroid(app, convite => recebidos.push(convite), url => outrosLinks.push(url));
  await Promise.resolve();
  abrir({ url: linkConvite(segundoToken) });
  abrir({ url: 'com.fastleituras.app://auth-callback/' });
  assert.deepEqual(recebidos, [token, segundoToken]);
  assert.deepEqual(outrosLinks, ['com.fastleituras.app://auth-callback/']);
  cancelar();
  await Promise.resolve();
  assert.equal(removido, true);
});

test('um novo convite recebido pelo app aberto prevalece sobre o link inicial atrasado', async () => {
  const recebidos = [];
  const atual = 'c'.repeat(64);
  let abrir;
  let resolver;
  const cancelar = ouvirConvitesAndroid({
    async addListener(_, callback) { abrir = callback; return { remove() {} }; },
    getLaunchUrl: () => new Promise(resolve => { resolver = resolve; }),
  }, recebido => recebidos.push(recebido), () => {});
  abrir({ url: 'com.fastleituras.app://convite?token=' + atual });
  resolver({ url: 'com.fastleituras.app://convite?token=' + token });
  await Promise.resolve();
  assert.deepEqual(recebidos, [atual]);
  cancelar();
});
