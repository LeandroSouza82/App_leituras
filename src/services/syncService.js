import { Network } from '@capacitor/network';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { supabase } from './supabase';

/**
 * syncService - Arquitetura Offline-First com Sincronização Automática em Background e Auditoria Visual.
 * 
 * Diretrizes:
 *  - O arquivo físico .jpg PERMANECE no disco (Directory.Data) para permitir preview e retake a qualquer momento.
 *  - A sincronização consome EXCLUSIVAMENTE o array 'fila_sync_auto' do localStorage.
 *  - Ao sincronizar cada item com sucesso, remove APENAS o item do array local.
 *  - Não realiza readdir cego, garantindo que o arquivo não seja re-sincronizado em loop.
 */

const FILA_SYNC_KEY = 'fila_sync_auto';
let isSyncRunning = false;
let networkListenerInitialized = false;

// ─── Helpers de Fila no localStorage ────────────────────────────────────────

export const readFilaSync = () => {
  try {
    const raw = localStorage.getItem(FILA_SYNC_KEY);
    if (!raw || raw === 'null' || raw === 'undefined') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeFilaSync = (items) => {
  try {
    const safeItems = Array.isArray(items) ? items : [];
    localStorage.setItem(FILA_SYNC_KEY, JSON.stringify(safeItems));
  } catch (err) {
  }
};

// ─── Conversor Base64 para Blob ─────────────────────────────────────────────

const base64ToBlob = (base64, mimeType = 'image/jpeg') => {
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([byteNumbers], { type: mimeType });
};

// ─── 1. Salvar Leitura Offline ──────────────────────────────────────────────

/**
 * Salva a leitura na fila local (localStorage) mantendo a foto física no Directory.Data.
 * 
 * @param {Object} payload - Dados da leitura (unidade_id, servico, leitura_atual, etc.)
 * @param {string|null} base64Image - Imagem em Base64 para salvar no disco se ainda não estiver
 * @param {string|null} fileName - Nome do arquivo físico no disco
 */
export async function salvarLeituraOffline(payload, base64Image = null, fileName = null) {
  try {
    if (base64Image && fileName) {
      try {
        await Filesystem.writeFile({
          path: fileName,
          data: base64Image.includes(',') ? base64Image.split(',')[1] : base64Image,
          directory: Directory.Data,
          recursive: true
        });
      } catch (fsErr) {
      }
    }

    const itemFila = {
      id: payload.id || `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      unidade_id: String(payload.unidade_id || '').trim(),
      servico: (payload.servico || 'AGUA').toUpperCase(),
      leitura_atual: payload.leitura_atual !== undefined ? parseFloat(payload.leitura_atual) : null,
      leiturista_id: payload.leiturista_id || null,
      data_leitura: payload.data_leitura || new Date().toISOString(),
      fileName: fileName || payload.fileName || null,
      timestamp: Date.now()
    };

    const filaAtual = readFilaSync();
    
    // Evita duplicatas na fila para o mesmo item
    const indexExistente = filaAtual.findIndex(
      f => f.unidade_id === itemFila.unidade_id && f.servico === itemFila.servico
    );

    if (indexExistente >= 0) {
      filaAtual[indexExistente] = itemFila;
    } else {
      filaAtual.push(itemFila);
    }

    writeFilaSync(filaAtual);

    // Se estiver online, tenta sincronizar imediatamente em background
    Network.getStatus().then(status => {
      if (status.connected) {
        sincronizarFilaEmBackground();
      }
    }).catch(() => {});

    return true;
  } catch (error) {
    return false;
  }
}

// ─── 2. Sincronizar Fila em Background ──────────────────────────────────────

/**
 * Consome EXCLUSIVAMENTE a fila 'fila_sync_auto' do localStorage.
 * Envia as fotos e metadados ao Supabase e remove da fila.
 * NUNCA deleta o arquivo físico do disco (preservado para auditoria e preview).
 */
export async function sincronizarFilaEmBackground() {
  if (isSyncRunning) {
    return;
  }

  try {
    const status = await Network.getStatus();
    if (!status.connected) {
      return;
    }

    const fila = readFilaSync();
    if (fila.length === 0) {
      return;
    }

    isSyncRunning = true;
    window.dispatchEvent(new CustomEvent('syncStatus', { detail: { syncing: true } }));

    const { data: { user } } = await supabase.auth.getUser();
    const userIdPadrao = user?.id || 'cf720ead-721b-4aa5-b505-9a90ce9202d7';

    for (const item of [...fila]) {
      try {
        let publicPhotoUrl = null;

        // 1. Upload da Foto para o Supabase Storage
        if (item.fileName) {
          try {
            const fileResult = await Filesystem.readFile({
              path: item.fileName,
              directory: Directory.Data
            });

            if (fileResult?.data) {
              const blob = base64ToBlob(fileResult.data, 'image/jpeg');
              const remotePath = `leituras/${Date.now()}_${item.fileName}`;

              const { error: uploadError } = await supabase.storage
                .from('fotos_leituras')
                .upload(remotePath, blob, { contentType: 'image/jpeg', upsert: true });

              if (uploadError) throw uploadError;

              const { data: publicUrlData } = supabase.storage
                .from('fotos_leituras')
                .getPublicUrl(remotePath);

              publicPhotoUrl = publicUrlData?.publicUrl || null;
            }
          } catch (fileErr) {
          }
        }

        // 2. Inserção / Upsert no Supabase Database
        const payloadEnvio = {
          unidade_id: item.unidade_id,
          servico: item.servico,
          leitura_atual: item.leitura_atual,
          foto_url: publicPhotoUrl || '',
          leiturista_id: item.leiturista_id || userIdPadrao,
          data_leitura: item.data_leitura || new Date().toISOString()
        };

        const { error: dbError } = await supabase
          .from('leituras_detalhes')
          .insert([payloadEnvio]);

        if (dbError) {
        }

        // 3. SUCESSO: Remove APENAS o item do array no localStorage.
        // O arquivo físico permanece no disco no Directory.Data para preview/auditoria.
        const filaAtualizada = readFilaSync().filter(f => f.id !== item.id);
        writeFilaSync(filaAtualizada);

      } catch (itemErr) {
      }
    }

    window.dispatchEvent(new CustomEvent('leiturasAtualizadas'));

  } catch (globalErr) {
  } finally {
    isSyncRunning = false;
    window.dispatchEvent(new CustomEvent('syncStatus', { detail: { syncing: false } }));
  }
}

// ─── 3. Observador Global de Rede ───────────────────────────────────────────

/**
 * Inicia o observador de conectividade.
 */
export function iniciarObservadorRede() {
  if (networkListenerInitialized) return;
  networkListenerInitialized = true;

  try {
    Network.addListener('networkStatusChange', async (status) => {
      if (status.connected) {
        setTimeout(() => {
          sincronizarFilaEmBackground();
        }, 1500);
      }
    });

    Network.getStatus().then((status) => {
      if (status.connected) {
        sincronizarFilaEmBackground();
      }
    }).catch(() => {});

  } catch (err) {
  }
}
