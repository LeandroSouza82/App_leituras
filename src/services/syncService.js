import { Filesystem, Directory } from '@capacitor/filesystem';
import { Encoding } from '@capacitor/filesystem';
import { supabase } from './supabase';

/**
 * syncService - Serviço modular de sincronização de leituras salvas offline.
 *
 * Estratégia:
 *  1. Lê a fila de leituras offline do localStorage (STORAGE_KEY = 'leituras_pendentes')
 *     e também varre os arquivos de foto no Filesystem (prefixo 'leitura_foto_').
 *  2. Para cada leitura com foto no disco: faz upload para o Supabase Storage,
 *     insere o registro no banco, deleta a foto local em caso de sucesso.
 *  3. Loop sequencial (não Promise.all) para não estourar memória com imagens pesadas.
 *  4. Falhas individuais são puladas; a leitura permanece na fila para nova tentativa.
 *  5. Chama onProgress(atual, total) a cada iteração para atualizar a UI em tempo real.
 */

const STORAGE_KEY = 'leituras_pendentes';

/** Lê a fila de leituras pendentes do localStorage de forma segura. */
const readPendingQueue = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[SyncService] Erro ao ler fila pendente do localStorage:', err);
    return [];
  }
};

/** Reescreve a fila (somente as que falharam) no localStorage. */
const writePendingQueue = (items) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch (err) {
    console.warn('[SyncService] Erro ao reescrever fila pendente:', err);
  }
};

/**
 * Converte Base64 (retornado pelo Capacitor Filesystem) em Blob para upload.
 * @param {string} base64 - String Base64 pura (sem prefixo data URI).
 * @param {string} mimeType - Tipo MIME (padrão: 'image/jpeg').
 * @returns {Blob}
 */
const base64ToBlob = (base64, mimeType = 'image/jpeg') => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([byteNumbers], { type: mimeType });
};

/**
 * Lista todos os arquivos de foto na raiz do Directory.Data de forma blindada.
 * Se o diretório/arquivos não existirem no Capacitor Android, retorna [].
 * @returns {Promise<string[]>} Array de nomes de arquivo.
 */
const listarFotosLocais = async () => {
  try {
    const result = await Filesystem.readdir({
      path: '',
      directory: Directory.Data,
    });
    if (!result || !result.files || !Array.isArray(result.files)) {
      return [];
    }
    return result.files
      .map((f) => (typeof f === 'string' ? f : f?.name || ''))
      .filter((name) => typeof name === 'string' && name.startsWith('leitura_foto_') && name.endsWith('.jpg'));
  } catch (err) {
    console.warn('[SyncService] Diretório vazio ou inacessível no Filesystem:', err);
    return [];
  }
};

/**
 * Obtém a quantidade total de itens (leituras na fila e fotos) aguardando sincronização.
 * Blindado para Android e Web: em qualquer erro ou ausência de arquivos, retorna 0 obrigatoriamente.
 * @returns {Promise<number>} Total de itens pendentes (inteiro >= 0).
 */
export async function obterTotalPendentes() {
  try {
    const filaLocal = readPendingQueue();
    const fotosLocais = await listarFotosLocais();
    const total = (Array.isArray(filaLocal) ? filaLocal.length : 0) + (Array.isArray(fotosLocais) ? fotosLocais.length : 0);
    return typeof total === 'number' && !isNaN(total) && total >= 0 ? total : 0;
  } catch (err) {
    console.warn('[SyncService] Erro ao obter total de pendentes (retornando 0):', err);
    return 0;
  }
}



/**
 * Faz upload de uma foto do disco para o Supabase Storage.
 * @param {string} fileName - Nome do arquivo local.
 * @returns {Promise<string>} URL pública gerada no Storage.
 */
const uploadFotoParaStorage = async (fileName) => {
  // Lê o arquivo em Base64 do disco
  const result = await Filesystem.readFile({
    path: fileName,
    directory: Directory.Data,
  });

  const blob = base64ToBlob(result.data, 'image/jpeg');
  const remotePath = `leituras/${Date.now()}_${fileName}`;

  const { error } = await supabase.storage
    .from('fotos_leituras')
    .upload(remotePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from('fotos_leituras')
    .getPublicUrl(remotePath);

  return publicUrlData.publicUrl;
};

/**
 * Deleta um arquivo de foto do armazenamento local do dispositivo.
 * @param {string} fileName - Nome do arquivo local.
 */
const deletarFotoLocal = async (fileName) => {
  try {
    await Filesystem.deleteFile({
      path: fileName,
      directory: Directory.Data,
    });
    console.log('[SyncService] Foto local deletada após upload:', fileName);
  } catch (err) {
    console.warn('[SyncService] Não foi possível deletar foto local:', fileName, err);
  }
};

/**
 * Insere uma leitura de detalhe no banco de dados Supabase.
 * @param {object} payload - Dados da leitura.
 */
const inserirLeituraNoSupabase = async (payload) => {
  const { error } = await supabase.from('leituras_detalhes').insert([payload]);
  if (error) throw error;
};

/**
 * Sincroniza as leituras pendentes e as fotos salvas localmente com o Supabase.
 *
 * @param {function(atual: number, total: number): void} [onProgress] - Callback de progresso.
 * @returns {Promise<{enviadas: number, falhas: number}>} Resultado da sincronização.
 */
export async function sincronizarPendentes(onProgress) {
  const resultadoFinal = { enviadas: 0, falhas: 0 };

  // ─── ETAPA 1: Sincronizar fila do localStorage (leituras simples sem foto) ───
  const filaLocal = readPendingQueue();
  const filaNaoEnviada = [];

  if (filaLocal.length > 0) {
    const totalFila = filaLocal.length;
    for (let i = 0; i < filaLocal.length; i++) {
      const item = filaLocal[i];
      onProgress?.(i + 1, totalFila + 1);
      try {
        const { tempId, ...dadosParaEnvio } = item;
        const { error } = await supabase
          .from('leituras')
          .insert([dadosParaEnvio]);
        if (error) throw error;
        resultadoFinal.enviadas++;
      } catch (err) {
        console.warn('[SyncService] Falha ao enviar item da fila:', item.tempId, err.message);
        filaNaoEnviada.push(item);
        resultadoFinal.falhas++;
      }
    }
  }

  // ─── ETAPA 2: Sincronizar fotos salvas no disco ─────────────────────────────
  const fotosLocais = await listarFotosLocais();
  const totalFotos = fotosLocais.length;

  for (let i = 0; i < fotosLocais.length; i++) {
    const fileName = fotosLocais[i];
    onProgress?.(filaNaoEnviada.length + filaLocal.length + i + 1, filaLocal.length + totalFotos);

    try {
      // Padrão: leitura_foto_{condoId}_{unidadeId}_{servico}_{timestamp}.jpg
      const partes = fileName.replace('.jpg', '').split('_');
      const unidadeId = partes.length >= 4 ? partes[3] : 'desconhecida';
      const servico = partes.length >= 5 ? partes[4].toUpperCase() : 'AGUA';

      const { data: { user } } = await supabase.auth.getUser();
      const leiturastaId = user?.id || null;

      const fotoPublicUrl = await uploadFotoParaStorage(fileName);

      await inserirLeituraNoSupabase({
        unidade_id: unidadeId,
        servico,
        foto_url: fotoPublicUrl,
        leiturista_id: leiturastaId,
        data_leitura: new Date().toISOString(),
        leitura_atual: null,
      });

      await deletarFotoLocal(fileName);
      resultadoFinal.enviadas++;
    } catch (err) {
      console.error('[SyncService] Falha ao processar foto, pulando:', fileName, err.message);
      resultadoFinal.falhas++;
    }
  }

  // ─── LIMPEZA FINAL GARANTIDA ─────────────────────────────────────────────────
  // Reescreve a fila do localStorage com somente as falhas (ou [] se tudo foi enviado).
  // Isso garante que obterTotalPendentes() retorne 0 na próxima leitura.
  writePendingQueue(filaNaoEnviada);

  // Calcula pendentes restantes para a UI ajustar pendingCount imediatamente
  const fotosRestantes = await listarFotosLocais();
  resultadoFinal.pendentesRestantes = filaNaoEnviada.length + fotosRestantes.length;

  return resultadoFinal;
}
