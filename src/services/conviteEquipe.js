export const URL_CONVITE = 'https://fastleitura.appviper.com.br/convite';
export const APP_ANDROID = 'com.fastleituras.app';
export const TOKEN_CONVITE = /^[a-f0-9]{64}$/;

export function lerTokenConvite(endereco) {
  if (!endereco) return null;
  try {
    const url = new URL(endereco);
    const web = url.origin === new URL(URL_CONVITE).origin && url.pathname === '/convite';
    const app = url.protocol === APP_ANDROID + ':' && url.hostname === 'convite' && (!url.pathname || url.pathname === '/');
    if (!web && !app) return null;
    const token = new URLSearchParams(url.hash.slice(1)).get('token') ?? url.searchParams.get('token');
    return TOKEN_CONVITE.test(token || '') ? token : null;
  } catch {
    return null;
  }
}

export function linkConvite(token) {
  if (!TOKEN_CONVITE.test(token || '')) throw new Error('O código do convite está inválido.');
  return URL_CONVITE + '#token=' + token;
}

export function abrirConviteAndroid(token) {
  const retorno = encodeURIComponent(linkConvite(token));
  return 'intent://convite?token=' + token + '#Intent;scheme=' + APP_ANDROID
    + ';package=' + APP_ANDROID + ';S.browser_fallback_url=' + retorno + ';end';
}

export function urlApkOficial(endereco) {
  try {
    const url = new URL(endereco);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
