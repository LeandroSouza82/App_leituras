import { Network } from '@capacitor/network';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { supabase } from './supabase';
import { temConexaoInternetUtil } from './networkQualityService';
import {
  sincronizarLeiturasAnterioresOffline,
  sincronizarCondominiosOffline,
} from './syncOfflineService';

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

// ─── Compressão de Foto Legada do Cache ─────────────────────────────────────

/**
 * Recebe o base64 de uma foto pesada localizada em Directory.Cache (fallback legado)
 * e retorna uma versão comprimida como base64 puro (sem prefixo data:URL).
 *
 * Regras:
 *  - Largura máxima: 1200 px. Imagens menores NÃO são ampliadas (sem upscale).
 *  - Proporção original preservada.
 *  - Qualidade JPEG: 0.7
 *  - A foto de entrada já possui carimbo/tarja; este helper NÃO adiciona nenhum.
 *
 * @param {string} base64  Base64 puro ou com prefixo data:URL da imagem original.
 * @returns {Promise<string>} Base64 puro (sem prefixo) da versão comprimida.
 */
async function comprimirFotoLegadaParaSync(base64) {
  const MAX_LARGURA = 1200;
  const QUALITY = 0.7;

  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

  // Decodifica base64 para Blob
  const byteChars = atob(cleanBase64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'image/jpeg' });

  // Cria ImageBitmap (compatível com WebView Android)
  const imageBitmap = await createImageBitmap(blob);

  const srcW = imageBitmap.width;
  const srcH = imageBitmap.height;

  // Calcula dimensões de saída: nunca aumenta imagem menor que MAX_LARGURA
  let destW = srcW;
  let destH = srcH;
  if (srcW > MAX_LARGURA) {
    destW = MAX_LARGURA;
    destH = Math.round(srcH * (MAX_LARGURA / srcW));
  }

  // Renderiza em canvas DOM (mecanismo comprovado no WebView Android)
  const canvas = document.createElement('canvas');
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, destW, destH);
  if (typeof imageBitmap.close === 'function') imageBitmap.close();

  // Serializa como JPEG com qualidade definida e retorna base64 puro
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

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
    let resolvedUserId = payload.leiturista_id || null;

    if (!resolvedUserId) {
      try {
        const { data } = await supabase.auth.getSession();
        resolvedUserId = data?.session?.user?.id || null;
      } catch (_) {
        resolvedUserId = null;
      }
    }

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
      db_id: payload.db_id || null,
      unidade_id: String(payload.unidade_id || '').trim(),
      condominio_id: payload.condominio_id || null,
      condominio_nome: payload.condominio_nome || null,
      servico: (payload.servico || 'AGUA').toUpperCase(),
      leitura_atual: payload.leitura_atual !== undefined ? parseFloat(payload.leitura_atual) : null,
      leiturista_id: resolvedUserId,
      data_leitura: payload.data_leitura || new Date().toISOString(),
      fileName: fileName || payload.fileName || null,
      photoPath: payload.photoPath || null,
      photoDirectory: payload.photoDirectory || null,
      timestamp: Date.now()
    };

    const filaAtual = readFilaSync();
    
    // Evita duplicatas apenas dentro do mesmo condomínio + unidade + serviço.
    // Apartamentos com o mesmo número em condomínios diferentes nunca podem colidir.
    const indexExistente = filaAtual.findIndex(
      f => String(f.condominio_id || '') === String(itemFila.condominio_id || '') &&
           f.unidade_id === itemFila.unidade_id &&
           f.servico === itemFila.servico
    );

    if (indexExistente >= 0) {
      filaAtual[indexExistente] = itemFila;
    } else {
      filaAtual.push(itemFila);
    }

    writeFilaSync(filaAtual);

    // Dispara evento instantâneo para espelhar a Interface Otimista na Busca Online
    window.dispatchEvent(new CustomEvent('leiturasAtualizadas'));

    // Só tenta sincronizar imediatamente quando a conexão está realmente utilizável.
    // Rede conectada porém degradada continua no fluxo offline sem bloquear o usuário.
    temConexaoInternetUtil().then(redeUtil => {
      if (redeUtil) sincronizarFilaEmBackground();
    }).catch(() => {});

    return true;
  } catch (error) {
    return false;
  }
}

// ─── Helpers privados de resolução de arquivo físico ───────────────────────

/**
 * Tenta localizar o arquivo físico de um item da fila percorrendo os caminhos
 * canônicos conhecidos, nesta ordem de prioridade:
 *   1. Caminho explícito salvo no item (item.photoPath / item.photoDirectory)
 *   2. Caminho organizado em Directory.Data: Backups/<condo>/<fileName>
 *   3. Caminho legado em Directory.Cache: FastLeituras/<condo>/<fileName>
 *
 * Retorna { fileResult, photoPath, photoDirectory } do primeiro que existir, ou
 * lança um erro descritivo se nenhum caminho for encontrado.
 *
 * Se o caminho encontrado for diferente do salvo no item, atualiza SOMENTE
 * photoPath e photoDirectory no localStorage para que retentativas futuras
 * já partam do caminho correto.
 *
 * @param {Object} item  Item da fila_sync_auto
 * @returns {Promise<{fileResult: object, photoPath: string, photoDirectory: string}>}
 */
async function localizarFotoFisicaDaFila(item) {
  const fileName = item.fileName;
  const safeCondo = String(item.condominio_nome || '').replace(/[^a-z0-9]/gi, '_');

  // Candidatos em ordem de prioridade:
  //   1. Caminho explícito salvo no item
  //   2. Backup organizado (Directory.Data)
  //   3. Cache legado (Directory.Cache)
  const candidatos = [
    {
      photoPath: item.photoPath || null,
      photoDirectory: item.photoDirectory === 'CACHE' ? Directory.Cache : Directory.Data
    },
    {
      photoPath: safeCondo ? `Backups/${safeCondo}/${fileName}` : null,
      photoDirectory: Directory.Data
    },
    {
      photoPath: safeCondo ? `FastLeituras/${safeCondo}/${fileName}` : null,
      photoDirectory: Directory.Cache
    }
  ];

  // Remove candidatos sem caminho definido e elimina duplicatas
  // (dois candidatos com mesmo path+directory não devem ser tentados duas vezes)
  const candidatosFiltrados = [];
  const vistos = new Set();
  for (const c of candidatos) {
    if (!c.photoPath) continue;
    const dirKey = c.photoDirectory === Directory.Cache ? 'CACHE' : 'DATA';
    const chave = `${dirKey}::${c.photoPath}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    candidatosFiltrados.push(c);
  }

  for (let ci = 0; ci < candidatosFiltrados.length; ci++) {
    const candidato = candidatosFiltrados[ci];
    const ehFallbackCache = candidato.photoDirectory === Directory.Cache;

    // ── Etapa 1: tenta ler o candidato — catch SOMENTE para "arquivo não existe" ──
    let fileResult;
    try {
      fileResult = await Filesystem.readFile({
        path: candidato.photoPath,
        directory: candidato.photoDirectory
      });
    } catch (_) {
      // Arquivo não existe neste candidato — tenta o próximo
      continue;
    }

    // ── Etapa 2: arquivo encontrado — qualquer falha daqui propaga como erro real ──

    // ── Fallback de Cache legado: comprime antes de fazer upload ────────────
    // Quando a foto pesada é encontrada SOMENTE no Cache (3º candidato),
    // gera uma cópia JPEG comprimida em Directory.Data/Backups e atualiza
    // a fila para apontar para essa versão comprimida.
    // Se a cópia comprimida já existir em Backups, reutiliza sem recomprimir.
    if (ehFallbackCache && fileResult?.data) {
      const backupPath = `Backups/${safeCondo}/${fileName}`;

      // Verifica se a versão comprimida já existe em Directory.Data/Backups
      let backupJaExiste = false;
      let backupFileResult = null;
      try {
        backupFileResult = await Filesystem.readFile({
          path: backupPath,
          directory: Directory.Data
        });
        backupJaExiste = true;
      } catch (_) {
        // Não existe ainda — será criada abaixo
      }

      if (!backupJaExiste) {
        // Comprime a foto pesada do Cache (já carimbada) sem re-carimbar.
        // Erros de compressão, canvas ou gravação propagam sem ser silenciados.
        const base64Comprimido = await comprimirFotoLegadaParaSync(fileResult.data);

        // Persiste a versão comprimida em Directory.Data/Backups
        await Filesystem.writeFile({
          path: backupPath,
          data: base64Comprimido,
          directory: Directory.Data,
          recursive: true
        });

        // Lê de volta para retornar como fileResult padronizado
        backupFileResult = await Filesystem.readFile({
          path: backupPath,
          directory: Directory.Data
        });
      }

      // Atualiza o item da fila para apontar para a versão comprimida em DATA
      const filaAtual = readFilaSync();
      const idx = filaAtual.findIndex(f => f.id === item.id);
      if (idx !== -1) {
        filaAtual[idx].photoPath = backupPath;
        filaAtual[idx].photoDirectory = 'DATA';
        writeFilaSync(filaAtual);
      }

      return { fileResult: backupFileResult, photoPath: backupPath, photoDirectory: Directory.Data };
    }
    // ── Fim do bloco de fallback de Cache legado ─────────────────────────────

    // Foto encontrada em DATA ou no caminho explícito — verifica se o caminho
    // difere do salvo no item para corrigir a fila
    const dirKey = candidato.photoDirectory === Directory.Cache ? 'CACHE' : 'DATA';
    const mesmoCaminho = (item.photoPath === candidato.photoPath && item.photoDirectory === dirKey);

    if (!mesmoCaminho) {
      // Corrige o item na fila para que próximas tentativas já usem o caminho real
      const filaAtual = readFilaSync();
      const idx = filaAtual.findIndex(f => f.id === item.id);
      if (idx !== -1) {
        filaAtual[idx].photoPath = candidato.photoPath;
        filaAtual[idx].photoDirectory = dirKey;
        writeFilaSync(filaAtual);
      }
    }

    return { fileResult, photoPath: candidato.photoPath, photoDirectory: candidato.photoDirectory };
  }

  throw new Error(
    `Foto física não localizada nos caminhos conhecidos para ${fileName}` +
    (safeCondo ? ` (condomínio: ${safeCondo})` : '') +
    '. Verifique se o arquivo foi excluído do dispositivo.'
  );
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

  // Trava adquirida ANTES de qualquer await. Isso impede que vários disparos
  // simultâneos passem pela checagem e façam upload da mesma foto em paralelo.
  isSyncRunning = true;

  let etapaSync = 'INICIO';
  let idsFilaNoInicio = null;

  try {
    localStorage.setItem('sync_debug', JSON.stringify({
      iniciou: true,
      etapa: 'INICIO',
      quantidadeFila: readFilaSync().length,
      data: new Date().toISOString()
    }));

    etapaSync = 'VERIFICAR_REDE';
    const redeUtil = await temConexaoInternetUtil();
    if (!redeUtil) {
      return;
    }

    etapaSync = 'LER_FILA';
    const fila = readFilaSync();
    if (fila.length === 0) {
      return;
    }

    // Snapshot usado apenas para detectar itens que entraram enquanto este ciclo rodava.
    idsFilaNoInicio = new Set(fila.map(item => item.id));
    window.dispatchEvent(new CustomEvent('syncStatus', { detail: { syncing: true } }));

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return;
    }
    const currentUserId = user.id;

    for (const item of [...fila]) {
      etapaSync = 'PROCESSAR_ITEM';
      let redeDegradadaNoItem = false;
      
      try {
        if (item.leiturista_id && item.leiturista_id !== currentUserId) {
          continue;
        }

        if (!item.leiturista_id) {
          if (!item.condominio_id) {
            continue;
          }

          const { data: condoPermitido, error: condoError } = await supabase
            .from('condominios')
            .select('id')
            .eq('id', item.condominio_id)
            .maybeSingle();

          if (condoError || !condoPermitido) {
            continue;
          }

          item.leiturista_id = currentUserId;
          const filaAtualizada = readFilaSync();
          const idx = filaAtualizada.findIndex(f => f.id === item.id);
          if (idx !== -1) {
            filaAtualizada[idx].leiturista_id = currentUserId;
            writeFilaSync(filaAtualizada);
          }
        }

        const leituristaEnvio = item.leiturista_id;
        let publicPhotoUrl = null;

        // 1. Upload da Foto para o Supabase Storage
        if (item.fileName) {
          let fileResult;
          try {
            etapaSync = 'LOCALIZAR_FOTO';
            // Delega a resolução de caminho ao helper com fallback em cascata:
            //  1º candidato: photoPath/photoDirectory salvo no item
            //  2º candidato: Backups/<condo>/<fileName> em Directory.Data
            //  3º candidato: FastLeituras/<condo>/<fileName> em Directory.Cache
            ({ fileResult } = await localizarFotoFisicaDaFila(item));
          } catch (fileError) {
            throw new Error(`Falha ao ler arquivo físico (${item.fileName}): ${fileError.message}`);
          }

          if (fileResult?.data) {
            etapaSync = 'LER_FOTO';
            const blob = base64ToBlob(fileResult.data, 'image/jpeg');
            if (!blob) throw new Error("A imagem armazenada localmente está corrompida.");
            
            etapaSync = 'UPLOAD_FOTO';
            const sanitizarNomeStorage = (nome) => {
              return String(nome || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9._-]/g, '_');
            };
            const nomeStorage = sanitizarNomeStorage(item.fileName);
            
            let remotePath = item.remotePath;
            if (!remotePath) {
              // Caminho determinístico: novas tentativas sobrescrevem o mesmo objeto
              // em vez de criar cópias com Date.now().
              const identificadorRemoto = sanitizarNomeStorage(
                item.db_id || item.id || `${item.condominio_id}_${item.unidade_id}_${item.servico}`
              );
              remotePath = `leituras/${identificadorRemoto}_${nomeStorage}`;
              item.remotePath = remotePath;
              const filaAtual = readFilaSync();
              const idx = filaAtual.findIndex(f => f.id === item.id);
              if (idx !== -1) {
                filaAtual[idx].remotePath = remotePath;
                writeFilaSync(filaAtual);
              }
            }

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

              // Se a conexão degradou durante o upload, interrompe imediatamente.
              // O item permanece íntegro na fila para uma tentativa futura.
              const redeAindaUtil = await temConexaoInternetUtil(2500);
              if (!redeAindaUtil) {
                redeDegradadaNoItem = true;
                break;
              }

              if (attempt < 2) {
                await new Promise(res => setTimeout(res, 1000));
                const redeAntesRetry = await temConexaoInternetUtil(2500);
                if (!redeAntesRetry) {
                  redeDegradadaNoItem = true;
                  break;
                }
              }
            }

            if (!uploadSuccess) {
              throw new Error("Falha no upload da imagem no sync em background: " + (lastUploadError?.message || ""));
            }

            etapaSync = 'OBTER_URL';
            const { data: publicUrlData } = supabase.storage
              .from('fotos_leituras')
              .getPublicUrl(remotePath);

            publicPhotoUrl = publicUrlData?.publicUrl;
            if (!publicPhotoUrl) throw new Error("URL pública não retornada pelo Supabase no sync.");
          } else {
            throw new Error("Arquivo não encontrado no sistema local durante o sync.");
          }
        }

        etapaSync = 'UPSERT_DB';
        // 2. Inserção / Upsert no Supabase Database
        const payloadEnvio = {
          id: item.db_id,
          condominio_nome: item.condominio_nome || null,
          unidade_id: item.unidade_id,
          servico: item.servico,
          leitura_atual: item.leitura_atual,
          foto_url: publicPhotoUrl || '',
          leiturista_id: leituristaEnvio,
          data_leitura: item.data_leitura || new Date().toISOString()
        };

        const { error: dbError } = await supabase
          .from('leituras_detalhes')
          .upsert([payloadEnvio], { onConflict: 'id' });

        if (dbError) {
          throw new Error("Erro DB insert: " + dbError.message);
        }

        etapaSync = 'REMOVER_FILA';
        // 3. SUCESSO: Remove APENAS o item do array no localStorage.
        const filaAtualizada = readFilaSync().filter(f => f.id !== item.id);
        writeFilaSync(filaAtualizada);
        
        etapaSync = 'CONCLUIDO';

      } catch (itemErr) {
        const erroMsg = itemErr?.message || String(itemErr);
        
        localStorage.setItem('sync_ultimo_erro', JSON.stringify({
          etapa: etapaSync,
          erro: erroMsg,
          unidade_id: item?.unidade_id,
          servico: item?.servico,
          db_id: item?.db_id,
          fileName: item?.fileName
        }));

        if (redeDegradadaNoItem) break;
        const redeAindaUtil = await temConexaoInternetUtil(2500);
        if (!redeAindaUtil) break;
      }
    }

    window.dispatchEvent(new CustomEvent('leiturasAtualizadas'));

  } catch (globalErr) {
    console.error('Erro global na sincronização:', globalErr);
  } finally {
    const filaRestante = readFilaSync();
    const existemItensNovos = idsFilaNoInicio instanceof Set &&
      filaRestante.some(item => !idsFilaNoInicio.has(item.id));

    isSyncRunning = false;
    window.dispatchEvent(new CustomEvent('syncStatus', { detail: { syncing: false } }));

    // Se novas leituras foram enfileiradas enquanto o snapshot atual estava em
    // processamento, executa um novo ciclo. Itens que falharam neste ciclo não
    // entram em retry apertado; continuam seguros na fila para a próxima tentativa.
    if (existemItensNovos) {
      setTimeout(() => sincronizarFilaEmBackground(), 300);
    }
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
    const sincronizarPendenciasSeRedeUtil = async () => {
      const redeUtil = await temConexaoInternetUtil();
      if (!redeUtil) return;

      sincronizarFilaEmBackground();
      sincronizarLeiturasAnterioresOffline();
      sincronizarCondominiosOffline();
    };

    Network.addListener('networkStatusChange', (status) => {
      if (status.connected) {
        setTimeout(() => sincronizarPendenciasSeRedeUtil(), 1500);
      }
    });

    sincronizarPendenciasSeRedeUtil().catch(() => {});

    // Executa a cada 2 minutos, mas somente quando o backend responde bem.
    setInterval(() => {
      sincronizarPendenciasSeRedeUtil().catch(() => {});
    }, 120000);

  } catch (err) {
  }
}
