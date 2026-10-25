import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { criarFluxoEmail, traduzirErroAuth, CONFIRMACAO_EMAIL_URL, MENSAGEM_CONFIRMACAO_SOLICITADA } from '../src/services/authEmailService.js';
import { lerRetornoConfirmacao, validarRetornoConfirmacao, ERRO_LINK_CONFIRMACAO } from '../src/services/emailConfirmationService.js';

const cadastro = { email: ' pessoa@example.test ', senha: 'senha-de-teste', nome: ' Pessoa ', celular: ' 123 ' };
const urlRetorno = 'https://fastleitura.appviper.com.br/confirmacao-email';

// SDK real, transporte simulado: nenhum usuário ou e-mail é criado em produção.
function clienteSimulado(responder) {
  return createClient('https://projeto.example.test', 'chave-publica-de-teste', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => responder(new URL(url), init) },
  });
}

test('signup pendente usa redirect correto e não declara entrega na caixa de entrada', async () => {
  const cliente = clienteSimulado((url, init) => {
    assert.equal(url.pathname, '/auth/v1/signup');
    assert.equal(url.searchParams.get('redirect_to'), CONFIRMACAO_EMAIL_URL);
    const payload = JSON.parse(init.body);
    assert.equal(payload.email, 'pessoa@example.test');
    assert.equal(payload.password, cadastro.senha);
    assert.deepEqual(payload.data, { full_name: 'Pessoa', phone: '123' });
    return new Response(JSON.stringify({ id: 'novo', identities: [{ provider: 'email' }] }), { status: 200 });
  });
  const resultado = await criarFluxoEmail(cliente.auth).cadastrar(cadastro);
  assert.equal(resultado.session, null);
  assert.equal(resultado.mensagem, MENSAGEM_CONFIRMACAO_SOLICITADA);
});

for (const operacao of ['cadastrar', 'reenviar']) {
  test(`${operacao}: 535/HTTP 500 nunca retorna estado de sucesso`, async () => {
    const cliente = clienteSimulado(() => new Response(JSON.stringify({ code: 'unexpected_failure', msg: 'Error sending confirmation email' }), { status: 500 }));
    const fluxo = criarFluxoEmail(cliente.auth);
    await assert.rejects(fluxo[operacao](operacao === 'cadastrar' ? cadastro : cadastro.email), (error) => {
      assert.equal(error.status, 500);
      assert.match(traduzirErroAuth(error), /Não foi possível enviar/);
      return true;
    });
    assert.equal(fluxo.segundosRestantes(), 60);
  });
}

test('reenviar usa type signup e o mesmo redirect sem criar conta', async () => {
  const cliente = clienteSimulado((url, init) => {
    assert.equal(url.pathname, '/auth/v1/resend');
    assert.equal(url.searchParams.get('redirect_to'), CONFIRMACAO_EMAIL_URL);
    const payload = JSON.parse(init.body);
    assert.equal(payload.type, 'signup');
    assert.equal(payload.email, 'pessoa@example.test');
    assert.equal(payload.password, undefined);
    return new Response('{}', { status: 200 });
  });
  assert.equal((await criarFluxoEmail(cliente.auth).reenviar(cadastro.email)).mensagem, MENSAGEM_CONFIRMACAO_SOLICITADA);
});

test('limite de 60s é compartilhado entre signup e reenvio; permite tentar depois', async () => {
  let agora = 1_000;
  let chamadas = 0;
  const resposta = async () => { chamadas++; return { data: {}, error: null }; };
  const fluxo = criarFluxoEmail({ signUp: resposta, resend: resposta }, () => agora);
  await fluxo.cadastrar(cadastro);
  await assert.rejects(fluxo.reenviar(cadastro.email), { code: 'email_cooldown' });
  agora += 59_999;
  assert.equal(fluxo.segundosRestantes(), 1);
  await assert.rejects(fluxo.cadastrar(cadastro), { code: 'email_cooldown' });
  agora++;
  await fluxo.reenviar(cadastro.email);
  assert.equal(chamadas, 2);
});

test('duplo clique não dispara duas solicitações simultâneas', async () => {
  let concluir;
  const fluxo = criarFluxoEmail({ signUp: () => new Promise(resolve => { concluir = resolve; }) });
  const pendente = fluxo.cadastrar(cadastro);
  await assert.rejects(fluxo.cadastrar(cadastro), { code: 'email_cooldown' });
  concluir({ data: {}, error: null });
  await pendente;
});

test('HTTP 429 não é convertido em envio aceito e não dispara repetição automática', async () => {
  let chamadas = 0;
  const cliente = clienteSimulado(() => {
    chamadas++;
    return new Response(JSON.stringify({ code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' }), { status: 429 });
  });
  await assert.rejects(criarFluxoEmail(cliente.auth).reenviar(cadastro.email), (error) => {
    assert.match(traduzirErroAuth(error), /Limite temporário/);
    return true;
  });
  assert.equal(chamadas, 1);
});

test('conta nova, ofuscada e duplicada têm a mesma mensagem pública', async () => {
  const respostas = [
    { data: { user: { identities: [{}] } }, error: null },
    { data: { user: { identities: [] } }, error: null },
    { data: null, error: { code: 'user_already_exists' } },
    { data: null, error: { code: 'email_exists' } },
  ];
  for (const resposta of respostas) {
    const resultado = await criarFluxoEmail({ signUp: async () => resposta }).cadastrar(cadastro);
    assert.equal(resultado.mensagem, MENSAGEM_CONFIRMACAO_SOLICITADA);
    assert.equal(resultado.session, null);
  }
  assert.equal(traduzirErroAuth({ code: 'invalid_credentials' }), traduzirErroAuth({ code: 'email_not_confirmed' }));
});

test('link ausente, só code e tipo recovery não anunciam confirmação', async () => {
  for (const url of [urlRetorno, `${urlRetorno}?code=outro-fluxo`, `${urlRetorno}#type=recovery&access_token=teste`]) {
    const auth = { getUser: () => assert.fail('não deveria consultar sem retorno válido') };
    assert.deepEqual(await validarRetornoConfirmacao(auth, lerRetornoConfirmacao(url)), { estado: 'erro', mensagem: ERRO_LINK_CONFIRMACAO });
  }
});

test('erros na query ou fragmento prevalecem sobre qualquer token', async () => {
  for (const erro of ['error=access_denied', 'error_code=otp_expired', 'error_description=Expirado']) {
    for (const url of [`${urlRetorno}?${erro}#type=signup&access_token=teste`, `${urlRetorno}#type=signup&access_token=teste&${erro}`]) {
      assert.equal(lerRetornoConfirmacao(url).token, null);
    }
  }
});

test('confirmação exige consulta ao Auth e email_confirmed_at; libera token após uso', async () => {
  const cliente = clienteSimulado((url, init) => {
    assert.equal(url.pathname, '/auth/v1/user');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer token-de-teste');
    return new Response(JSON.stringify({ id: 'pessoa', email_confirmed_at: '2026-10-25T09:00:00Z' }), { status: 200 });
  });
  const retorno = lerRetornoConfirmacao(`${urlRetorno}#type=signup&access_token=token-de-teste&refresh_token=nao-usar`);
  assert.deepEqual(await validarRetornoConfirmacao(cliente.auth, retorno), { estado: 'sucesso' });
  assert.equal(retorno.token, null);
  assert.equal((await cliente.auth.getSession()).data.session, null);
});

test('token inválido ou usuário sem confirmação não mostra sucesso', async () => {
  for (const resposta of [{ data: { user: {} }, error: null }, { data: null, error: { status: 401 } }]) {
    const retorno = { token: 'teste' };
    assert.equal((await validarRetornoConfirmacao({ getUser: async () => resposta }, retorno)).estado, 'erro');
    assert.equal(retorno.token, null);
  }
});

test('falha de rede na confirmação não é confundida com ativação nem expõe erro bruto', async () => {
  const retorno = { token: 'teste' };
  const resultado = await validarRetornoConfirmacao({ getUser: async () => { throw new TypeError('Failed to fetch'); } }, retorno);
  assert.equal(resultado.estado, 'erro');
  assert.match(resultado.mensagem, /conexão/);
  assert.doesNotMatch(resultado.mensagem, /Failed to fetch/);
  assert.equal(retorno.token, null);
});
