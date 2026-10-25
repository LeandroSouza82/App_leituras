export const CONFIRMACAO_EMAIL_URL = 'https://fastleitura.appviper.com.br/confirmacao-email';
export const INTERVALO_EMAIL_MS = 60_000;
export const MENSAGEM_CONFIRMACAO_SOLICITADA = 'Solicitação recebida. Se houver confirmação pendente para este e-mail, você receberá um link. Confira também o spam. Se já confirmou, tente entrar ou recuperar a senha.';

export function traduzirErroAuth(err) {
  const msg = String(err?.message || '').toLowerCase();
  const code = err?.code;
  if (err?.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit', 'email_cooldown'].includes(code)
    || msg.includes('rate limit') || msg.includes('security purposes')) {
    return 'Limite temporário de tentativas atingido. Aguarde alguns minutos e tente novamente. O serviço pode exigir uma espera maior.';
  }
  if (msg.includes('error sending confirmation email')) {
    return 'Não foi possível enviar o e-mail de confirmação. Tente novamente mais tarde. Se persistir, entre em contato com o suporte.';
  }
  if (err?.status >= 500) return 'O serviço está temporariamente indisponível. Tente novamente mais tarde.';
  if (['invalid_credentials', 'email_not_confirmed'].includes(code)
    || msg.includes('invalid login credentials') || msg.includes('email not confirmed')) {
    return 'Não foi possível entrar. Confira e-mail, senha e a confirmação do endereço.';
  }
  if (code === 'otp_expired' || msg.includes('expired') || msg.includes('invalid token')) {
    return 'Link inválido ou expirado. Solicite um novo e-mail de confirmação no aplicativo.';
  }
  if (err?.name === 'AuthRetryableFetchError' || msg.includes('fetch') || msg.includes('network')) {
    return 'Não foi possível conectar. Confira sua conexão e tente novamente.';
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}

// A espera local evita cliques repetidos. Os limites efetivos continuam no servidor.
export function criarFluxoEmail(auth, agora = Date.now) {
  let emAndamento = false;
  let proximaTentativa = 0;
  const segundosRestantes = () => Math.max(0, Math.ceil((proximaTentativa - agora()) / 1000));

  const solicitar = async (operacao) => {
    if (emAndamento || segundosRestantes() > 0) {
      throw Object.assign(new Error('Aguarde para solicitar outro e-mail.'), { code: 'email_cooldown' });
    }
    emAndamento = true;
    try {
      const { data, error } = await operacao();
      // Mesmo resultado público para usuário novo, ofuscado ou já cadastrado.
      if (error && !['user_already_exists', 'email_exists'].includes(error.code)) throw error;
      return { session: error ? null : data?.session ?? null, mensagem: MENSAGEM_CONFIRMACAO_SOLICITADA };
    } finally {
      proximaTentativa = agora() + INTERVALO_EMAIL_MS;
      emAndamento = false;
    }
  };

  return {
    segundosRestantes,
    cadastrar: ({ email, senha, nome, celular }) => solicitar(() => auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        emailRedirectTo: CONFIRMACAO_EMAIL_URL,
        data: { full_name: nome.trim(), phone: celular.trim() },
      },
    })),
    reenviar: (email) => solicitar(() => auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: CONFIRMACAO_EMAIL_URL },
    })),
  };
}
