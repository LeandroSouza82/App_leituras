import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { Share } from '@capacitor/share';
import { supabase } from './supabase.js';

export async function chamarEquipe(operacao, argumentos, client = supabase) {
  const { data, error } = await client.rpc(operacao, argumentos);
  if (error?.code === 'PGRST202') {
    throw new Error('Convites indisponíveis nesta versão do servidor.');
  }
  if (error) throw error;
  return data;
}

export async function abrirWhatsAppComConvite(link) {
  const texto = 'Oi! Estou te convidando para fazer parte da equipe Fast Leituras.\n\n'
    + 'Abra o link e toque em Abrir o Fast Leituras. Se precisar instalar, baixe o APK na mesma página e volte a este link depois da instalação.\n\n'
    + 'Entre com sua conta Google, confira o e-mail e aceite o convite para ver os condomínios que liberei.\n\n' + link;
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
