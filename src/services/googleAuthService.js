/**
 * googleAuthService.js
 * Serviço isolado para autenticação nativa com o Google via Capacitor.
 *
 * Fluxo:
 *  - Android (nativo): GoogleAuth.signIn() → idToken → supabase.signInWithIdToken()
 *  - Web (fallback):   useGoogleLogin() do @react-oauth/google (tratado no componente)
 */

import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { supabase } from './supabaseClient';

/**
 * Inicializa o plugin nativo do Google Auth.
 * Deve ser chamado UMA vez no bootstrap do app (main.jsx ou App.jsx).
 */
export function initGoogleAuth() {
  try {
    GoogleAuth.initialize({
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scopes: ['profile', 'email'],
      grantOfflineAccess: true,
    });
  } catch (err) {
    console.warn('GoogleAuth.initialize falhou (esperado no browser):', err);
  }
}

/**
 * Realiza o login nativo com o Google e autentica no Supabase.
 * Abre o seletor nativo de contas do Android — sem browser externo, sem URL feia.
 *
 * @returns {{ data: object|null, error: Error|null }}
 */
export async function loginGoogleNativo() {
  try {
    // Abre o seletor nativo de contas Google (pop-up do sistema Android)
    const googleUser = await GoogleAuth.signIn();

    const idToken = googleUser?.authentication?.idToken;
    if (!idToken) throw new Error('idToken não retornado pelo Google.');

    // Autentica direto no Supabase via idToken — sem redirecionamento de URL
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Erro no login nativo Google:', err);
    return { data: null, error: err };
  }
}
