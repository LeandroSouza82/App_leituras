import { customAlert, customConfirm } from '../components/CustomPrompt/CustomPrompt';
import { Network } from '@capacitor/network';
import { supabase } from './supabase';
import { normalizarNome } from './ucondoImportService';

/**
 * syncOfflineService — Fila de Sincronização para Leituras Anteriores (Offline-First)
 *
 * Responsabilidades:
 *  - Guardar no localStorage os lotes de leituras anteriores extraídos da planilha.
 *  - Quando a rede for restaurada, enviar esses lotes silenciosamente ao Supabase.
 *  - Nunca bloquear o fluxo de importação — o usuário já pode trabalhar offline.
 *
 * Chave da fila: 'fila_sync_leituras_anteriores'
 * Cada item da fila contém:
 *   {
 *     id        : string (uuid local),
 *     condominioId : string,
 *     servico   : 'AGUA' | 'GAS' | 'ENERGIA',
 *     leituras  : Array<{ unidade: string, leitura_anterior: number }>,
 *     timestamp : number,
 *   }
 */

const FILA_KEY = 'fila_sync_leituras_anteriores';
const FILA_COND_KEY = 'fila_sync_condominios';
let isSyncLeiturasRunning = false;
let isSyncCondsRunning = false;
let listenerInicializado = false;

// ─── Helpers de Fila ────────────────────────────────────────────────────────

const lerFila = () => {
  try {
    const raw = localStorage.getItem(FILA_KEY);
    if (!raw || raw === 'null' || raw === 'undefined') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const gravarFila = (items) => {
  try {
    localStorage.setItem(FILA_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch { /* Espaço insuficiente — falha silenciosa */ }
};

const lerFilaCondominios = () => {
  try {
    const raw = localStorage.getItem(FILA_COND_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const gravarFilaCondominios = (items) => {
  try {
    localStorage.setItem(FILA_COND_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {}
};

// ─── 1. Enfileirar (chamado durante importação offline) ──────────────────────

/**
 * Salva as leituras anteriores extraídas da planilha na fila local.
 * NÃO faz nenhuma chamada de rede — retorna imediatamente.
 *
 * @param {string} condominioId
 * @param {Array<{unidade: string, leitura_anterior: number}>} leiturasArray
 * @param {'AGUA'|'GAS'|'ENERGIA'} servico
 */
export const enfileirarLeiturasAnteriores = (condominioId, leiturasArray, servico = 'AGUA') => {
  if (!condominioId || !Array.isArray(leiturasArray) || leiturasArray.length === 0) return;

  const novoItem = {
    id: `lant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    condominioId: String(condominioId),
    servico: String(servico).toUpperCase(),
    leituras: leiturasArray,
    timestamp: Date.now(),
  };

  const fila = lerFila();

  // Substitui item existente para o mesmo condomínio+serviço (evita duplicatas na fila)
  const idxExistente = fila.findIndex(
    (f) => f.condominioId === novoItem.condominioId && f.servico === novoItem.servico
  );

  if (idxExistente >= 0) {
    fila[idxExistente] = novoItem;
  } else {
    fila.push(novoItem);
  }

  gravarFila(fila);
};

export const enfileirarNovoCondominio = (condominioData) => {
  if (!condominioData || !condominioData.id) return;
  const fila = lerFilaCondominios();
  fila.push(condominioData);
  gravarFilaCondominios(fila);
};

// ─── 2. Sincronizar em Background (chamado quando a rede volta) ──────────────

/**
 * Consome a fila 'fila_sync_leituras_anteriores' e envia ao Supabase.
 * - Busca as unidades do banco pelo condominioId para obter os IDs relacionais.
 * - Faz insert em lote em 'unidades_leituras'.
 * - Remove o item da fila apenas após sucesso.
 * - NUNCA lança exceção para o chamador — falhas são silenciosas e o item permanece na fila.
 */
export const sincronizarLeiturasAnterioresOffline = async () => {
  if (isSyncLeiturasRunning) return;

  try {
    const status = await Network.getStatus();
    if (!status.connected) return;

    const fila = lerFila();
    if (fila.length === 0) return;

    isSyncLeiturasRunning = true;

    // Obtém o usuário autenticado uma única vez para todo o lote
    let activeUserId = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      activeUserId = user?.id || null;
    } catch { /* Mantém null */ }

    for (const item of [...fila]) {
      try {
        // 1. Busca as unidades cadastradas para este condomínio
        const { data: unidadesBanco, error: errUnidades } = await supabase
          .from('unidades')
          .select('id, nome, condominio_id')
          .eq('condominio_id', item.condominioId);

        if (errUnidades || !unidadesBanco || unidadesBanco.length === 0) {
          // Mantém o item na fila para tentar novamente depois
          console.warn(`[syncOfflineService] Unidades não encontradas para condomínio ${item.condominioId}. Tentará novamente.`);
          continue;
        }

        // 2. Monta o lote de inserção relacionando unidade_id via nome normalizado
        const loteParaEnvio = [];

        for (const leitura of item.leituras) {
          const unidadeBanco = unidadesBanco.find(
            (u) => normalizarNome(u.nome) === normalizarNome(leitura.unidade)
          );

          if (unidadeBanco) {
            loteParaEnvio.push({
              unidade: unidadeBanco.nome,
              condominio_nome: item.condominioId, // Campo usado conforme schema existente
              leitura_anterior: leitura.leitura_anterior,
              mes_referencia: leitura.mes_referencia || null, // Garante que o mês correto suba para o BD
              leiturista_id: activeUserId,
              servico: item.servico,
            });
          }
        }

        if (loteParaEnvio.length === 0) {
          // Nenhuma unidade bateu — descarta da fila para não ficar em loop eterno
          const filaAtualizada = lerFila().filter((f) => f.id !== item.id);
          gravarFila(filaAtualizada);
          continue;
        }

        // 3. Insere em lote
        const { error: insertError } = await supabase
          .from('unidades_leituras')
          .insert(loteParaEnvio);

        if (insertError) {
          console.warn(`[syncOfflineService] Falha ao inserir lote para condomínio ${item.condominioId}:`, insertError);
          await customAlert(`ERRO BD (unidades_leituras): ${insertError.message || JSON.stringify(insertError)}`);
          continue; // Mantém na fila, tenta novamente na próxima janela de rede
        }

        // 4. Sucesso — remove apenas este item da fila
        const filaAtualizada = lerFila().filter((f) => f.id !== item.id);
        gravarFila(filaAtualizada);

      } catch (itemErr) {
        console.warn('[syncOfflineService] Erro inesperado ao processar item da fila:', itemErr);
      }
    }
  } catch (globalErr) {
    console.warn('[syncOfflineService] Erro global no sync de leituras anteriores:', globalErr);
  } finally {
    isSyncLeiturasRunning = false;
  }
};

export const sincronizarCondominiosOffline = async () => {
  if (isSyncCondsRunning) return;
  try {
    const status = await Network.getStatus();
    if (!status.connected) return;

    const fila = lerFilaCondominios();
    if (fila.length === 0) return;

    isSyncCondsRunning = true;
    let activeUserId = null;
    try {
      const { data: { user } } = await supabase.auth.getSession();
      activeUserId = user?.id || null;
    } catch {}

    if (!activeUserId) return; // Precisa do user pra criar

    for (const cond of [...fila]) {
      try {
        // Formata para o Supabase
        const dbCond = {
           id: cond.id,
           user_id: activeUserId,
           nome: String(cond.nome || '').trim(),
           tipo_leitura: cond.tipoLeitura || 'Água e Gás',
           dia_leitura: String(cond.diaLeitura || '').trim(),
           apartamentos: Number(cond.apartamentos || 0),
           valor: Number(cond.valor || 0),
           endereco: cond.endereco || null,
           instrucoes_acesso: cond.instrucoesAcesso || null,
           telefone_sindico: cond.contatoSindico || null,
        };

        const { error: insertErr } = await supabase.from('condominios').insert(dbCond);
        
        if (!insertErr || insertErr.code === '23505') { // 23505 = unique_violation (já existe)
           // Cria também a leitura do mês (mesma lógica do condominioService)
           const hoje = new Date();
           const mesReferencia = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
           await supabase.from('leituras').insert({
             condominio_id: cond.id,
             user_id: activeUserId,
             mes_referencia: mesReferencia,
             concluido: false,
           });

           // Remove da fila
           const filaAtualizada = lerFilaCondominios().filter((c) => c.id !== cond.id);
           gravarFilaCondominios(filaAtualizada);
        } else {
           console.warn(`[syncOffline] Falha ao inserir condomínio ${cond.nome}:`, insertErr);
        }
      } catch (err) {
        console.warn('[syncOffline] Erro ao sincronizar condomínio:', err);
      }
    }
  } catch (err) {
    console.warn('[syncOffline] Erro global condominios:', err);
  } finally {
    isSyncCondsRunning = false;
  }
};

// ─── 3. Inicializar Observador de Rede (chumbado na conta) ──────────────────

/**
 * Registra o listener de reconexão para disparar o sync automaticamente.
 * Deve ser chamado UMA VEZ na inicialização do app (ex: main.jsx ou App.jsx).
 * É idempotente — chamadas repetidas são ignoradas.
 */
export const iniciarSyncLeiturasAnteriores = () => {
  if (listenerInicializado) return;
  listenerInicializado = true;

  try {
    Network.addListener('networkStatusChange', (status) => {
      if (status.connected) {
        // Pequeno delay para garantir estabilidade da conexão antes de sincronizar
        setTimeout(() => {
          sincronizarLeiturasAnterioresOffline();
        }, 2000);
      }
    });

    // Tenta na inicialização caso já haja itens pendentes e rede disponível
    Network.getStatus()
      .then((status) => {
        if (status.connected) {
          sincronizarCondominiosOffline();
          sincronizarLeiturasAnterioresOffline();
        }
      })
      .catch(() => {});

    // Retry periódico a cada 3 minutos
    setInterval(() => {
      Network.getStatus()
        .then((status) => {
          if (status.connected) {
            sincronizarCondominiosOffline();
            sincronizarLeiturasAnterioresOffline();
          }
        })
        .catch(() => {});
    }, 180_000);

  } catch (err) {
    console.warn('[syncOfflineService] Erro ao iniciar observador de rede:', err);
  }
};
