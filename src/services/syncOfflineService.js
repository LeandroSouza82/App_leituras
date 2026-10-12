import { customAlert } from '../components/CustomPrompt/CustomPrompt';
import { temConexaoInternetUtil } from './networkQualityService';
import { supabase, criarClienteParaToken } from './supabase';
import { getCurrentMonthKey } from '../utils/mesLeituras';
import {
  lerFilaPersistida, gravarFilaPersistida, removerItemConfirmado,
  donoDoItem, periodoDoItem, capturarContextoSync, exigirContaOffline,
} from './offlineQueueStorage';
import { normalizarNome } from './ucondoSpreadsheetMetadata';

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

// ─── Helpers de Fila ────────────────────────────────────────────────────────

const lerFila = () => lerFilaPersistida(FILA_KEY);
const gravarFila = (items) => gravarFilaPersistida(FILA_KEY, items);
const lerFilaCondominios = () => lerFilaPersistida(FILA_COND_KEY);
const gravarFilaCondominios = (items) => gravarFilaPersistida(FILA_COND_KEY, items);

// ─── 1. Enfileirar (chamado durante importação offline) ──────────────────────

/**
 * Salva as leituras anteriores extraídas da planilha na fila local.
 * NÃO faz nenhuma chamada de rede — retorna imediatamente.
 *
 * @param {string} condominioId
 * @param {Array<{unidade: string, leitura_anterior: number}>} leiturasArray
 * @param {'AGUA'|'GAS'|'ENERGIA'} servico
 */
export const enfileirarLeiturasAnteriores = (condominioId, leiturasArray, servico = 'AGUA', contexto = {}) => {
  if (!condominioId || !Array.isArray(leiturasArray) || leiturasArray.length === 0) throw new Error('Lote de leituras anteriores inválido.');
  const owner = exigirContaOffline(contexto.userId);
  const mesReferencia = contexto.mesReferencia || getCurrentMonthKey();
  if (!periodoDoItem({ mes_referencia: mesReferencia })) throw new Error('Mês da fila inválido.');
  if (leiturasArray.some(l => l.mes_referencia && l.mes_referencia !== mesReferencia)) throw new Error('Separe as leituras anteriores por mês antes de enfileirar.');

  const novoItem = {
    id: `lant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    condominioId: String(condominioId),
    servico: String(servico).toUpperCase(),
    leituras: leiturasArray.map(l => ({ ...l, mes_referencia: mesReferencia })),
    _offline_user_id: owner,
    mes_referencia: mesReferencia,
    timestamp: Date.now(),
  };

  const fila = lerFila();

  // Substitui apenas o mesmo condomínio/serviço/conta/mês.
  const idxExistente = fila.findIndex(
    (f) => f.condominioId === novoItem.condominioId && f.servico === novoItem.servico
      && donoDoItem(f) === owner && periodoDoItem(f) === mesReferencia
  );

  if (idxExistente >= 0) {
    fila[idxExistente] = novoItem;
  } else {
    fila.push(novoItem);
  }

  return gravarFila(fila);
};

export const enfileirarNovoCondominio = (condominioData) => {
  if (!condominioData?.id) throw new Error('Condomínio offline sem identificador.');
  const owner = exigirContaOffline(condominioData.user_id || condominioData._offline_user_id);
  if (donoDoItem(condominioData) && donoDoItem(condominioData) !== owner
    || condominioData.user_id && condominioData._offline_user_id && condominioData.user_id !== condominioData._offline_user_id) {
    throw new Error('O condomínio tem identificação de conta divergente.');
  }
  const item = {
    ...condominioData, user_id: owner, _offline_user_id: owner,
    mes_referencia: condominioData.mes_referencia || getCurrentMonthKey(),
  };
  if (!periodoDoItem(item)) throw new Error('Mês do condomínio offline inválido.');
  const fila = lerFilaCondominios();
  const index = fila.findIndex(f => f.id === item.id && donoDoItem(f) === owner && periodoDoItem(f) === item.mes_referencia);
  if (index < 0) fila.push(item);
  else fila[index] = item;
  return gravarFilaCondominios(fila);
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
  isSyncLeiturasRunning = true;

  try {
    const redeUtil = await temConexaoInternetUtil();
    if (!redeUtil) return;

    const fila = lerFila();
    if (fila.length === 0) return;

    const contexto = await capturarContextoSync(supabase.auth, criarClienteParaToken);
    if (!contexto) return;
    const { client, userId: activeUserId } = contexto;

    for (const item of [...fila]) {
      try {
        contexto.assertActive();
        if (donoDoItem(item) !== activeUserId || !periodoDoItem({ mes_referencia: item.mes_referencia })) continue;
        // 1. Busca as unidades cadastradas para este condomínio
        const { data: unidadesBanco, error: errUnidades } = await client
          .from('unidades')
          .select('id, nome, condominio_id')
          .eq('condominio_id', item.condominioId);

        if (errUnidades || !unidadesBanco || unidadesBanco.length === 0) {
          console.warn(`[syncOfflineService] Unidades não encontradas para condomínio ${item.condominioId}. Tentará novamente.`);
          if (!(await temConexaoInternetUtil(2500))) break;
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
              mes_referencia: item.mes_referencia, // Mês fixado na importação, sem recalcular na reconexão.
              leiturista_id: activeUserId,
              servico: item.servico,
            });
          }
        }

        if (loteParaEnvio.length !== item.leituras.length) {
          console.warn('[syncOfflineService] Lote incompleto: unidades sem correspondência. Pendência preservada.');
          continue;
        }

        // 3. Guarda os registros anteriores para removê-los somente após o novo lote existir.
        const { data: registrosAnteriores, error: erroConsultaAnteriores } = await client
          .from('unidades_leituras')
          .select('id')
          .eq('condominio_nome', item.condominioId)
          .eq('leiturista_id', activeUserId)
          .eq('servico', item.servico)
          .eq('mes_referencia', item.mes_referencia);

        if (erroConsultaAnteriores) {
          console.warn(`[syncOfflineService] Falha ao consultar lote anterior de ${item.condominioId}:`, erroConsultaAnteriores);
          if (!(await temConexaoInternetUtil(2500))) break;
          continue;
        }

        // 4. Insere o novo lote antes de excluir o anterior, evitando janela de perda.
        const { error: insertError } = await client
          .from('unidades_leituras')
          .insert(loteParaEnvio);

        if (insertError) {
          console.warn(`[syncOfflineService] Falha ao inserir lote para condomínio ${item.condominioId}:`, insertError);
          await customAlert(`ERRO BD (unidades_leituras): ${insertError.message || JSON.stringify(insertError)}`);
          if (!(await temConexaoInternetUtil(2500))) break;
          continue;
        }

        const idsAnteriores = (registrosAnteriores || []).map((row) => row.id).filter(Boolean);
        if (idsAnteriores.length > 0) {
          const { error: erroExclusaoAnteriores } = await client
            .from('unidades_leituras')
            .delete()
            .in('id', idsAnteriores);

          if (erroExclusaoAnteriores) {
            console.warn(`[syncOfflineService] Novo lote salvo, mas o lote anterior não pôde ser removido:`, erroExclusaoAnteriores);
            continue;
          }
        }

        // 5. Sucesso — remove apenas este item da fila
        contexto.assertActive();
        removerItemConfirmado(FILA_KEY, item);

      } catch (itemErr) {
        console.warn('[syncOfflineService] Erro inesperado ao processar item da fila:', itemErr);
        if (!(await temConexaoInternetUtil(2500))) break;
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
  isSyncCondsRunning = true;

  try {
    const redeUtil = await temConexaoInternetUtil();
    if (!redeUtil) return;

    const fila = lerFilaCondominios();
    if (fila.length === 0) return;

    const contexto = await capturarContextoSync(supabase.auth, criarClienteParaToken);
    if (!contexto) return;
    const { client, userId: activeUserId } = contexto;

    for (const cond of [...fila]) {
      try {
        contexto.assertActive();
        if (donoDoItem(cond) !== activeUserId || !periodoDoItem({ mes_referencia: cond.mes_referencia })) continue;
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

        const { error: insertErr } = await client.from('condominios').insert(dbCond);
        
        if (!insertErr || insertErr.code === '23505') { // 23505 = unique_violation (já existe)
           // Cria a leitura do mês no formato canônico, somente se ainda não existir.
           const mesReferencia = cond.mes_referencia;
           const { data: leituraExistente, error: leituraConsultaError } = await client
             .from('leituras')
             .select('id')
             .eq('condominio_id', cond.id)
             .eq('user_id', activeUserId)
             .eq('mes_referencia', mesReferencia)
             .limit(1);

           if (leituraConsultaError) {
             console.warn(`[syncOffline] Falha ao verificar leitura mensal de ${cond.nome}:`, leituraConsultaError);
             if (!(await temConexaoInternetUtil(2500))) break;
             continue;
           }

           if (!leituraExistente || leituraExistente.length === 0) {
             const { error: leituraInsertError } = await client.from('leituras').insert({
               condominio_id: cond.id,
               user_id: activeUserId,
               mes_referencia: mesReferencia,
               concluido: false,
             });

             if (leituraInsertError) {
               console.warn(`[syncOffline] Falha ao criar leitura mensal de ${cond.nome}:`, leituraInsertError);
               if (!(await temConexaoInternetUtil(2500))) break;
               continue;
             }
           }

           // Remove da fila
           contexto.assertActive();
           removerItemConfirmado(FILA_COND_KEY, cond);
        } else {
           console.warn(`[syncOffline] Falha ao inserir condomínio ${cond.nome}:`, insertErr);
           if (!(await temConexaoInternetUtil(2500))) break;
        }
      } catch (err) {
        console.warn('[syncOffline] Erro ao sincronizar condomínio:', err);
        if (!(await temConexaoInternetUtil(2500))) break;
      }
    }
  } catch (err) {
    console.warn('[syncOffline] Erro global condominios:', err);
  } finally {
    isSyncCondsRunning = false;
  }
};
