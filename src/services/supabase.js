import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const isValidSupabaseUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
const hasValidCredentials = isValidSupabaseUrl && supabaseAnonKey.length > 0;

let supabase = null;

if (hasValidCredentials) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch {
    supabase = null;
  }
}

export { supabase };
