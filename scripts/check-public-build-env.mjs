const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key, VITE_GOOGLE_CLIENT_ID: google } = process.env;
if (!url || new URL(url).protocol !== 'https:' || !key || !google?.endsWith('.apps.googleusercontent.com')) {
  throw new Error('Configure as variáveis públicas VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e VITE_GOOGLE_CLIENT_ID do repositório.');
}
if (!key.startsWith('sb_publishable_')) {
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* Rejeita chaves administrativas ou inválidas. */ }
  if (role !== 'anon') throw new Error('O build do cliente aceita somente chave publishable/anon.');
}
console.log('Configuração pública do cliente verificada; nenhum valor foi exibido.');
