import { Network } from '@capacitor/network';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const DEFAULT_TIMEOUT_MS = 3500;

/**
 * Considera a rede utilizável somente quando o aparelho está conectado
 * E o backend responde dentro de um limite curto.
 * A requisição é realmente cancelada via AbortController no timeout.
 */
export async function temConexaoInternetUtil(timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const status = await Network.getStatus();
    if (!status.connected || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
        signal: controller.signal,
      });

      return response.ok;
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (_) {
    return false;
  }
}
