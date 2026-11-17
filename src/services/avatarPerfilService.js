import { Capacitor, CapacitorHttp } from '@capacitor/core';

const LIMITE = 350000;
const imagemLocalValida = data => typeof data === 'string' && data.length <= LIMITE
  && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(data);

export const criarAvatarPerfilService = ({
  storage = globalThis.localStorage,
  http = CapacitorHttp,
  nativo = () => Capacitor.isNativePlatform(),
} = {}) => {
  const chave = userId => `fastleituras_avatar_v1_${userId}`;
  const limpar = userId => { try { storage?.removeItem(chave(userId)); } catch {} };
  return {
    limpar,
    async carregar(userId, endereco, { atualizar = false } = {}) {
      if (!userId || !endereco) return null;
      let url;
      try {
        url = new URL(endereco);
        if (url.protocol !== 'https:' || url.username || url.password) return null;
      } catch { return null; }

      let salva = null;
      try {
        const cache = JSON.parse(storage?.getItem(chave(userId)) || 'null');
        if (cache?.url === url.href && imagemLocalValida(cache.data)) salva = cache.data;
      } catch { /* Cache indisponível não impede exibir a foto. */ }
      if (salva && !atualizar) return salva;

      // A requisição nativa é limitada à imagem pública hospedada pelo Google.
      // Não altera o fetch do app nem envia os tokens de autenticação do usuário.
      if (!nativo() || !url.hostname.endsWith('.googleusercontent.com')) return salva || url.href;
      try {
        const resposta = await http.get({
          url: url.href, responseType: 'arraybuffer',
          connectTimeout: 8000, readTimeout: 8000, disableRedirects: true,
        });
        const tipo = Object.entries(resposta.headers || {})
          .find(([nome]) => nome.toLowerCase() === 'content-type')?.[1]?.split(';')[0]?.trim();
        const data = `data:${tipo};base64,${resposta.data}`;
        if (resposta.status !== 200 || !imagemLocalValida(data)) return salva || url.href;
        try { storage?.setItem(chave(userId), JSON.stringify({ url: url.href, data })); } catch {}
        return data;
      } catch {
        return salva || url.href;
      }
    },
  };
};

export const avatarPerfilService = criarAvatarPerfilService();
