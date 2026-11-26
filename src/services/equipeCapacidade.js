export async function servidorSuportaEquipe(client) {
  const { error } = await client.rpc('equipe_meu_papel');
  if (error?.code === 'PGRST202') return false;
  if (error) throw error;
  return true;
}
