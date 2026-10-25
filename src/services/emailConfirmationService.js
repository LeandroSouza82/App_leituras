export const ERRO_LINK_CONFIRMACAO = 'Link inválido, expirado ou já utilizado. Abra o aplicativo e solicite um novo e-mail de confirmação.';

// Apenas o token de acesso permanece em memória. Nenhum token vai para storage ou deep link.
export function lerRetornoConfirmacao(url) {
  const retorno = new URL(url);
  const hash = new URLSearchParams(retorno.hash.slice(1));
  const erro = ['error', 'error_code', 'error_description'].some((key) => retorno.searchParams.has(key) || hash.has(key));
  return { token: erro || hash.get('type') !== 'signup' ? null : hash.get('access_token') };
}

export async function validarRetornoConfirmacao(auth, retorno) {
  if (!retorno.token) return { estado: 'erro', mensagem: ERRO_LINK_CONFIRMACAO };
  try {
    // Consulta o Auth com o JWT recebido; não confia em flags ou claims locais.
    const { data, error } = await auth.getUser(retorno.token);
    if (error) throw error;
    if (!data?.user?.email_confirmed_at) return { estado: 'erro', mensagem: ERRO_LINK_CONFIRMACAO };
    return { estado: 'sucesso' };
  } catch (error) {
    const falhaConexao = error?.name === 'AuthRetryableFetchError' || error instanceof TypeError || error?.status >= 500;
    return {
      estado: 'erro',
      mensagem: falhaConexao
        ? 'Não foi possível verificar a confirmação agora. Confira sua conexão e tente entrar no aplicativo. Se necessário, solicite um novo link.'
        : ERRO_LINK_CONFIRMACAO,
    };
  } finally {
    retorno.token = null;
  }
}
