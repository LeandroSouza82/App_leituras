import { supabase } from './supabase';
import { Network } from '@capacitor/network';

/**
 * Restaura silenciosamente a gaveta local `leituras_anteriores_${condominioId}`
 * buscando dados do Supabase (tabela `unidades_leituras`).
 *
 * Só executa quando:
 *   - Há conexão de rede
 *   - A chave local ainda não existe (app recém-instalado ou localStorage limpo)
 *   - O usuário está autenticado (garante isolamento por RLS)
 *
 * @param {string|number} condominioId - ID do condomínio a restaurar
 * @returns {Promise<void>}
 */
export const sincronizarLeiturasNuvemParaLocal = async (condominioId) => {
  if (!condominioId || !supabase) return;

  const chaveLocal = `leituras_anteriores_${condominioId}`;

  // Sai imediatamente se a gaveta local já existe — sem custo de rede
  const gaveta = localStorage.getItem(chaveLocal);
  if (gaveta !== null) return;

  try {
    // Verifica conectividade antes de qualquer request
    const status = await Network.getStatus();
    if (!status.connected) return;

    // Confirma sessão ativa — respeita RLS do Supabase
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;

    // Busca as leituras anteriores do condomínio na nuvem.
    // A RLS da tabela `unidades_leituras` filtra automaticamente por usuário autenticado.
    // O campo `condominio_nome` armazena o condominio_id conforme ucondoImportService.
    const { data, error } = await supabase
      .from('unidades_leituras')
      .select('unidade, leitura_anterior')
      .eq('condominio_nome', condominioId);

    if (error || !data || data.length === 0) return;

    // Remonta o array no formato esperado pelo app: { unidade, leitura_anterior }
    const leiturasRemontadas = data
      .filter((row) => row.unidade && row.leitura_anterior !== null && row.leitura_anterior !== undefined)
      .map((row) => ({
        unidade: String(row.unidade).trim(),
        leitura_anterior: parseFloat(row.leitura_anterior),
      }));

    if (leiturasRemontadas.length === 0) return;

    // Reconstrói a gaveta local silenciosamente
    localStorage.setItem(chaveLocal, JSON.stringify(leiturasRemontadas));
  } catch {
    // Falha silenciosa — o app continua funcionando normalmente
  }
};
