import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/services/shareIntentService.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export const ShareIntentService', 'globalThis.service');
function setup({ launch, read, duringRegistration } = {}) {
  let listener;
  let reads = 0;
  const context = vm.createContext({
    console: { warn() {} },
    App: {
      async addListener(_, callback) {
        listener = callback;
        if (duringRegistration) await callback(duringRegistration);
        return { async remove() {} };
      },
      async getLaunchUrl() { return launch; },
    },
    Filesystem: { async readFile(options) { reads++; return read ? read(options) : { data: 'UEs=' }; } },
  });
  vm.runInContext(source, context);
  return { service: context.service, emit: data => listener(data), reads: () => reads };
}

test('recupera planilha na abertura inicial usando leitura nativa', async () => {
  const url = 'file:///data/files/entrega/S%C3%A3o_Bento.xlsx';
  const received = [];
  const s = setup({ launch: { url }, read: options => {
    assert.equal(options.path, url);
    return { data: 'UEs=' };
  } });
  await s.service.init(file => received.push(file));
  assert.equal(received.length, 1);
  assert.equal(received[0].name, 'São_Bento.xlsx');
  assert.equal(received[0].data, 'data:application/octet-stream;base64,UEs=');
});

test('evento e abertura inicial da mesma entrega geram uma confirmação', async () => {
  const data = { url: 'file:///data/files/entrega/a.xlsx' };
  const s = setup({ launch: data, duringRegistration: data });
  let count = 0;
  await s.service.init(() => count++);
  assert.equal(count, 1);
  assert.equal(s.reads(), 1);
});

test('recebe novas entregas e ignora links de autenticação', async () => {
  const s = setup();
  let count = 0;
  await s.service.init(() => count++);
  await s.emit({ url: 'com.fastleituras.app://login' });
  await s.emit({ url: 'content://provider/a.xlsx' });
  await s.emit({ url: 'content://provider/b.xlsx' });
  assert.equal(count, 2);
  assert.equal(s.reads(), 2);
});

test('falha de permissão mostra erro e permite nova tentativa', async () => {
  let fail = true;
  const s = setup({ read: () => {
    if (fail) throw new Error('Permission denied');
    return { data: 'UEs=' };
  } });
  let errors = 0;
  let count = 0;
  await s.service.init(() => count++, () => errors++);
  const data = { url: 'content://provider/a.xlsx' };
  await s.emit(data);
  fail = false;
  await s.emit(data);
  assert.equal(errors, 1);
  assert.equal(count, 1);
});

test('arquivo vazio não inicia importação; stop invalida recebimento pendente', async () => {
  const s = setup({ read: () => ({ data: '' }) });
  let errors = 0;
  let count = 0;
  await s.service.init(() => count++, () => errors++);
  await s.emit({ url: 'content://provider/empty.xlsx' });
  assert.equal(errors, 1);
  await s.service.stop();
  await s.emit({ url: 'content://provider/other.xlsx' });
  assert.equal(count, 0);
  assert.equal(s.reads(), 1);
});
