import assert from 'node:assert/strict';
import test from 'node:test';
import { abrirConviteAndroid, lerTokenConvite, linkConvite, urlApkOficial } from '../src/services/conviteEquipe.js';

const token = 'a'.repeat(64);

test('o link novo e o link antigo preservam o mesmo convite para o Android', () => {
  const convite = linkConvite(token);
  assert.equal(new URL(convite).search, '');
  assert.equal(lerTokenConvite(convite), token);
  assert.equal(lerTokenConvite(convite.replace('#', '?')), token);
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
