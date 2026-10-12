import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL e anon key não configurados.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Mesma biblioteca/configuração oficial; cada ciclo conserva a identidade de origem.
export const criarClienteParaToken = (token, assertActive) => createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => { assertActive(); return token; },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: (...args) => { assertActive(); return globalThis.fetch(...args); },
  },
});

export { supabase };
