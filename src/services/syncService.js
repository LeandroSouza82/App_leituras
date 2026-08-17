import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { supabase } from './supabase';

/**
 * syncService - Serviço modular de sincronização de leituras salvas offline.
 *
 * Fontes de pendências:
 *   1. localStorage (STORAGE_KEY) — leituras sem foto (metadados simples).
 *   2. Filesystem (Directory.Data) — arquivos de foto com prefixo 'leitura_foto_'.
 *
 * Regras de limpeza:
 *   - Após envio bem-sucedido de cada foto → deleta o arquivo físico do disco.
 *   - Ao final de tudo → sobrescreve o localStorage com [].
 *   - obterTotalPendentes() relê tudo do zero: localStorage + disco.
 */

const STORAGE_KEY = 'leituras_pendentes';

// ─── Helpers de localStorage ───────────────────────────────────────────────

/** Lê a fila de leituras pendentes do localStorage. Nunca lança exceção. */
const readPendingQueue = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw === 'null' || raw === 'undefined') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Reescreve a fila no localStorage. Passa [] para limpar completamente.
 * Nunca lança exceção.
 */
const writePendingQueue = (items) => {
  try {
    const safeItems = Array.isArray(items) ? items : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeItems));
  } catch (err) {
    console.warn('[SyncService] Erro ao reescrever fila no localStorage:', err);
  }
};

// ─── Helpers de Filesystem ────────────────────────────────────────────────

/**
 * Lista todos os arquivos de foto pendentes na raiz do Directory.Data.
 * No Android, se o diretório estiver vazio ou inacessível, retorna [].
 * @returns {Promise<string[]>}
 */
const listarFotosLocais = async () => {
  try {
    const result = await Filesystem.readdir({
      path: '',
      directory: Directory.Data,
    });

    if (!result?.files || !Array.isArray(result.files)) return [];

    return result.files
      .map((f) => (typeof f === 'string' ? f : (f?.name ?? '')))
      .filter((name) =>
        typeof name === 'string' &&
        name.startsWith('leitura_foto_') &&
        name.endsWith('.jpg')
      );
  } catch {
    // Diretório vazio ou inexistente — comportamento normal quando não há pendências
    return [];
  }
};

/**
 * Deleta um arquivo de foto do disco local.
 * Silencia erros (arquivo já pode ter sido deletado).
 */
const deletarFotoLocal = async (fileName) => {
  try {
    await Filesystem.deleteFile({
      path: fileName,
      directory: Directory.Data,
    });
    console.log('[SyncService] Foto local deletada:', fileName);
  } catch {
    console.warn('[SyncService] Foto não encontrada para deleção (pode já ter sido removida):', fileName);
  }
};

// ─── Helpers de Supabase ──────────────────────────────────────────────────

/**
 * Converte Base64 bruto (sem prefixo data URI) em Blob para upload.
 */
const base64ToBlob = (base64, mimeType = 'image/jpeg') => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([byteNumbers], { type: mimeType });
};

const uploadFotoParaStorage = async (fileName) => {
  const result = await Filesystem.readFile({
    path: fileName,
    directory: Directory.Data,
  });

  const blob = base64ToBlob(result.data, 'image/jpeg');
  const remotePath = `leituras/${Date.now()}_${fileName}`;

  const { error } = await supabase.storage
    .from('fotos_leituras')
    .upload(remotePath, blob, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from('fotos_leituras')
    .getPublicUrl(remotePath);

  return publicUrlData.publicUrl;
};

const inserirLeituraNoSupabase = async (payload) => {
  const { error } = await supabase.from('leituras_detalhes').insert([payload]);
  if (error) throw error;
};

// ─── API Pública ──────────────────────────────────────────────────────────

/**
 * Retorna o total de itens pendentes (localStorage + fotos no disco).
 *
 * LEITURA ESTRITA:
 *   - Se o localStorage estiver vazio, nulo ou inválido → conta como 0.
 *   - Se o Filesystem lançar erro (diretório inexistente) → conta como 0.
 *   - Retorna SEMPRE um inteiro >= 0. Nunca lança exceção.
 *
 * @returns {Promise<number>}
 */
export async function obterTotalPendentes() {
  try {
    const filaLocal = readPendingQueue();
    const totalFila = Array.isArray(filaLocal) ? filaLocal.length : 0;

    const fotosLocais = await listarFotosLocais();
    const totalFotos = Array.isArray(fotosLocais) ? fotosLocais.length : 0;

    const total = totalFila + totalFotos;
    return Number.isFinite(total) && total >= 0 ? total : 0;
  } catch {
    return 0;
  }
}

/**
 * Sincroniza TODAS as leituras pendentes com o Supabase.
 *
 * Etapa 1 — Fila do localStorage (registros sem foto).
 * Etapa 2 — Fotos no Filesystem (upload + insert + deleção local).
 * Limpeza  — Sobrescreve localStorage com [] ao final INCONDICIONALMENTE.
 *
 * @param {function(atual: number, total: number): void} [onProgress]
 * @returns {Promise<{enviadas: number, falhas: number, pendentesRestantes: number}>}
 */
export async function sincronizarPendentes(onProgress) {
  const resultadoFinal = { enviadas: 0, falhas: 0, pendentesRestantes: 0 };

  // ─── ETAPA 1: Fila do localStorage ───────────────────────────────────────
  const filaLocal = readPendingQueue();
  const filaNaoEnviada = [];
  const totalFila = filaLocal.length;

  for (let i = 0; i < totalFila; i++) {
    const item = filaLocal[i];
    onProgress?.(i + 1, totalFila);
    try {
      const { tempId, ...dadosParaEnvio } = item;
      const { error } = await supabase.from('leituras').insert([dadosParaEnvio]);
      if (error) throw error;
      resultadoFinal.enviadas++;
    } catch (err) {
      console.warn('[SyncService] Falha ao enviar item da fila:', item?.tempId, err?.message);
      filaNaoEnviada.push(item);
      resultadoFinal.falhas++;
    }
  }

  // ─── ETAPA 2: Fotos no disco ──────────────────────────────────────────────
  const fotosLocais = await listarFotosLocais();
  const totalFotos = fotosLocais.length;

  for (let i = 0; i < totalFotos; i++) {
    const fileName = fotosLocais[i];
    onProgress?.(totalFila + i + 1, totalFila + totalFotos);

    try {
      // Tenta ler o arquivo — se não existir no disco (excluído manualmente),
      // lança exceção que é capturada abaixo como descarte (não conta como falha).
      let fileData;
      try {
        fileData = await Filesystem.readFile({
          path: fileName,
          directory: Directory.Data,
        });
      } catch (readErr) {
        // Arquivo não existe mais no disco — foi excluído manualmente.
        // Descarta silenciosamente: não é falha de rede, não volta para a fila.
        console.warn(`[SyncService] Foto ausente no disco, descartando: ${fileName}`);
        resultadoFinal.enviadas++; // conta como processado para não inflacionar falhas
        continue;
      }

      const partes = fileName.replace('.jpg', '').split('_');
      // Padrão: leitura_foto_{condoId}_{unidadeId}_{servico}_{timestamp}.jpg
      const unidadeId = partes[3] ?? 'desconhecida';
      const servico = (partes[4] ?? 'AGUA').toUpperCase();

      const { data: { user } } = await supabase.auth.getUser();

      // Converte Base64 lido para Blob e faz upload
      const blob = base64ToBlob(fileData.data, 'image/jpeg');
      const remotePath = `leituras/${Date.now()}_${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('fotos_leituras')
        .upload(remotePath, blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('fotos_leituras')
        .getPublicUrl(remotePath);

      await inserirLeituraNoSupabase({
        unidade_id: unidadeId,
        servico,
        foto_url: publicUrlData.publicUrl,
        leiturista_id: user?.id ?? null,
        data_leitura: new Date().toISOString(),
        leitura_atual: null,
      });

      // ✅ Deleta o arquivo físico IMEDIATAMENTE após upload bem-sucedido
      await deletarFotoLocal(fileName);
      resultadoFinal.enviadas++;
    } catch (err) {
      console.error('[SyncService] Falha ao processar foto, mantendo para nova tentativa:', fileName, err?.message);
      resultadoFinal.falhas++;
      // Foto permanece no disco para nova tentativa (falha real de rede/Supabase)
    }
  }

  // ─── LIMPEZA FINAL AGRESSIVA ──────────────────────────────────────────────
  // Sobrescreve localStorage com APENAS as falhas ([] se tudo enviou).
  // Isso garante que obterTotalPendentes() retorne 0 na próxima chamada.
  writePendingQueue(filaNaoEnviada);

  // Rele o disco para confirmar o que sobrou de verdade
  const fotosRestantes = await listarFotosLocais();
  resultadoFinal.pendentesRestantes = filaNaoEnviada.length + fotosRestantes.length;

  console.log(
    `[SyncService] Concluído. Enviadas: ${resultadoFinal.enviadas}, Falhas: ${resultadoFinal.falhas}, Restantes: ${resultadoFinal.pendentesRestantes}`
  );

  return resultadoFinal;
}
