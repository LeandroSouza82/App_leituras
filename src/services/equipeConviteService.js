import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { Share } from '@capacitor/share';
import { supabase } from './supabase.js';

export const CAMINHO_CONVITE = '/convite';
export const ORIGEM_CONVITE = 'https://fastleitura.appviper.com.br';
export const TOKEN_CONVITE_VALIDO = /^[a-f0-9]{64}$/;

export async function chamarEquipe(operacao, argumentos, client = supabase) {
  const { data, error } = await client.rpc(operacao, argumentos);
  if (error?.code === 'PGRST202') {
    throw new Error('Convites indisponíveis nesta versão do servidor.');
  }
  if (error) throw error;
  return data;
}

export function criarLinkConvite(token) {
  if (!TOKEN_CONVITE_VALIDO.test(token)) throw new Error('O servidor retornou um convite inválido.');
  return ORIGEM_CONVITE + CAMINHO_CONVITE + '#convite=' + token;
}

export async function abrirWhatsAppComConvite(link) {
  const texto = 'Oi! Estou te convidando para fazer parte da equipe Fast Leituras.\n\n'
    + 'Abra o link, toque em Continuar com Google e escolha sua conta Google pessoal. '
    + 'Se ainda não tiver o aplicativo, você pode baixá-lo na mesma página.\n\n'
    + 'Depois, é só entrar no Fast Leituras com essa mesma conta para ver os condomínios que liberei para você.\n\n' + link;
  const mensagem = encodeURIComponent(texto);

  if (!Capacitor.isNativePlatform()) {
    window.location.assign('https://wa.me/?text=' + mensagem);
    return;
  }

  try {
    const resultado = await AppLauncher.openUrl({ url: 'whatsapp://send?text=' + mensagem });
    if (resultado.completed) return;
  } catch (error) {
    // Em aparelhos com outro aplicativo de mensagens, o seletor permite compartilhar o mesmo convite.
  }

  await Share.share({ text: texto, dialogTitle: 'Compartilhar convite' });
}
