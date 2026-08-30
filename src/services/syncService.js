import { Network } from '@capacitor/network';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { supabase } from './supabase';
import { sincronizarLeiturasAnterioresOffline } from './syncOfflineService';
import { customAlert } from '../components/CustomPrompt/CustomPrompt';

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
  try {
    if (!base64 || typeof base64 !== 'string') return null;
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([byteNumbers], { type: mimeType });
  } catch (e) {
    console.warn('Erro ao decodificar base64:', e);
    return null;
  }
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
        console.error('Falha crítica ao gravar foto no disco:', fsErr);
        throw new Error('Falha ao salvar a foto localmente. Verifique o espaço no aparelho.');
      }
    }

    const itemFila = {
      id: payload.id || `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      unidade_id: String(payload.unidade_id || '').trim(),
      condominio_id: payload.condominio_id || null,
      condominio_nome: payload.condominio_nome || null,
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

    // Dispara evento instantâneo para espelhar a Interface Otimista na Busca Online
    window.dispatchEvent(new CustomEvent('leiturasAtualizadas'));

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
        // Verifica duplicação no Supabase antes de subir (proteção inegociável)
        const { data: existingData } = await supabase
          .from('leituras_detalhes')
          .select('id')
          .eq('unidade_id', item.unidade_id)
          .eq('servico', item.servico)
          .eq('data_leitura', item.data_leitura)
          .limit(1);
          
        if (existingData && existingData.length > 0) {
          // Já existe, apenas remove da fila
          const filaAtualizada = readFilaSync().filter(f => f.id !== item.id);
          writeFilaSync(filaAtualizada);
          continue;
        }

        let publicPhotoUrl = null;

        // 1. Upload da Foto para o Supabase Storage
        if (item.fileName) {
          let fileResult;
          try {
            fileResult = await Filesystem.readFile({
              path: item.fileName,
              directory: Directory.Data
            });
          } catch (fileError) {
            console.warn(`[Sync] Removendo arquivo fantasma da fila: ${item.id || item.fileName}`);
            
            // 1. Puxar a fila atual do localStorage 
            const chaveFila = 'fila_sync_auto';
            let filaAtual = JSON.parse(localStorage.getItem(chaveFila) || '[]');
            
            // 2. Filtrar removendo o item corrompido
            let novaFila = filaAtual.filter(f => f.id !== item.id && f.fileName !== item.fileName);
            
            // 3. Salvar a nova fila limpa no localStorage
            localStorage.setItem(chaveFila, JSON.stringify(novaFila));

            // 2. Remove do array de fotos/dados locais para sumir da interface imediatamente
            if (item.condominio_id && item.unidade_id) {
              try {
                const chaveLocal = `leituras_anteriores_${item.condominio_id}`;
                const rawLeituras = localStorage.getItem(chaveLocal);
                if (rawLeituras) {
                  let leiturasLocais = JSON.parse(rawLeituras);
                  leiturasLocais = leiturasLocais.map(L => {
                    if (String(L.unidade).trim() === String(item.unidade_id).trim()) {
                      return { ...L, fileName: null, foto_url: null, leitura_atual: null };
                    }
                    return L;
                  });
                  localStorage.setItem(chaveLocal, JSON.stringify(leiturasLocais));
                }
              } catch (e) {
                console.warn('[Sync] Erro ao limpar fantasma do array local', e);
              }
            }

            // Garante re-render na tela para o usuário ver sumir na hora
            window.dispatchEvent(new CustomEvent('leiturasAtualizadas'));
            
            // Pula para o próximo item da fila silenciosamente
            continue; 
          }

          if (fileResult?.data) {
            const blob = base64ToBlob(fileResult.data, 'image/jpeg');
            if (!blob) throw new Error("A imagem armazenada localmente está corrompida.");
            
            const remotePath = `leituras/${Date.now()}_${item.fileName}`;

            let uploadSuccess = false;
            let lastUploadError = null;

            for (let attempt = 1; attempt <= 2; attempt++) {
              const { error: uploadError } = await supabase.storage
                .from('fotos_leituras')
                .upload(remotePath, blob, { contentType: 'image/jpeg', upsert: true });

              if (!uploadError) {
                uploadSuccess = true;
                break;
              }
              lastUploadError = uploadError;
              if (attempt < 2) await new Promise(res => setTimeout(res, 1000));
            }

            if (!uploadSuccess) {
              throw new Error("Falha no upload da imagem no sync em background: " + (lastUploadError?.message || ""));
            }

            const { data: publicUrlData } = supabase.storage
              .from('fotos_leituras')
              .getPublicUrl(remotePath);

            publicPhotoUrl = publicUrlData?.publicUrl;
            if (!publicPhotoUrl) throw new Error("URL pública não retornada pelo Supabase no sync.");
          } else {
            throw new Error("Arquivo não encontrado no sistema local durante o sync.");
          }
        }

          // 2. Inserção / Upsert no Supabase Database
          const payloadEnvio = {
            condominio_nome: item.condominio_nome || null,
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
            console.error("Erro absoluto no insert leituras_detalhes:", dbError);
            throw new Error("Erro DB insert: " + dbError.message);
          }

        // UPDATE encadeado na tabela da unidade (apartamento) preparando para o próximo mês
        if (item.condominio_id && item.unidade_id && item.leitura_atual !== undefined && item.leitura_atual !== null) {
          const { error: updateError } = await supabase
            .from('unidades')
            .update({ leitura_anterior: item.leitura_atual })
            .eq('condominio_id', item.condominio_id)
            .eq('nome', item.unidade_id);
            
          if (updateError) {
             console.error("Erro ao atualizar leitura anterior na tabela unidades:", updateError);
          }
        }

        // 3. SUCESSO: Remove APENAS o item do array no localStorage.
        // O arquivo físico permanece no disco no Directory.Data para preview/auditoria.
        const filaAtualizada = readFilaSync().filter(f => f.id !== item.id);
        writeFilaSync(filaAtualizada);

      } catch (itemErr) {
        console.error(`[Sync] Falha na sincronização do item ${item.id}. Será tentado novamente no próximo ciclo. Detalhes:`, itemErr);
      }
    }

    window.dispatchEvent(new CustomEvent('leiturasAtualizadas'));

  } catch (globalErr) {
    console.error('Erro global na sincronização:', globalErr);
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
          sincronizarLeiturasAnterioresOffline();
        }, 1500);
      }
    });

    Network.getStatus().then((status) => {
      if (status.connected) {
        sincronizarFilaEmBackground();
        sincronizarLeiturasAnterioresOffline();
      }
    }).catch(() => {});

    // Executa a cada 2 minutos para garantir que nada fique preso
    setInterval(() => {
      Network.getStatus().then((status) => {
        if (status.connected) {
          sincronizarFilaEmBackground();
          sincronizarLeiturasAnterioresOffline();
        }
      }).catch(() => {});
    }, 120000);

  } catch (err) {
  }
}
