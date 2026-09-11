import * as XLSX from 'xlsx';
import { salvarArquivoSeguro } from './filesystemService';
import { salvarCondominio } from './condominioService';
import { supabase } from './supabase';
import { customAlert, customPrompt, customConfirm, customConfirmDestrutivo } from '../components/CustomPrompt/CustomPrompt';
import { enfileirarLeiturasAnteriores, enfileirarNovoCondominio } from './syncOfflineService';
import { deduplicarGavetaAnteriores } from './leiturasAnterioresService';
import {
  normalizarNome,
  calcularDistanciaLevenstein,
  extrairServicoDeTexto,
  extrairMetadadosPlanilha,
  extrairUnidadesELeituras,
  analisarPlanilhaCompleta,
} from './ucondoSpreadsheetParser';

export { normalizarNome, calcularDistanciaLevenstein };

/**
 * Serviço Sênior Modular para Importação de planilhas do uCondo.
 * Orquestra leitura de arquivos, diálogos de confirmação e persistência local/remota.
 */
export const UCondoImportService = {
  /**
   * Lê o arquivo de forma segura garantindo suporte ao Base64 gerado pelo Capacitor,
   * sem depender exclusivamente de heurísticas de comprimento.
   * @param {ArrayBuffer|Uint8Array|string} fileData - Conteúdo do arquivo
   * @returns {XLSX.WorkBook}
   */
  lerWorkbook(fileData) {
    if (!fileData) {
      throw new Error('Nenhum dado de arquivo fornecido para importação.');
    }

    let workbook;
    try {
      if (typeof fileData === 'string') {
        if (fileData.startsWith('data:')) {
          // A) String iniciando com "data:" -> extrair Base64
          const base64Content = fileData.split(',')[1] || fileData;
          workbook = XLSX.read(base64Content, { type: 'base64' });
        } else {
          // D) String sem prefixo data: (Provavelmente Base64 puro do Capacitor)
          try {
            workbook = XLSX.read(fileData, { type: 'base64' });
          } catch (e) {
            // Fallback controlado para binary se não for Base64 válido
            workbook = XLSX.read(fileData, { type: 'binary' });
          }
        }
      } else if (fileData instanceof ArrayBuffer || fileData instanceof Uint8Array) {
        // B e C) ArrayBuffer / Uint8Array
        const uint8 = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData;
        workbook = XLSX.read(uint8, { type: 'array' });
      } else {
        // Fallback genérico para array (se for um array nativo)
        workbook = XLSX.read(fileData, { type: 'array' });
      }
    } catch (fallbackErr) {
      throw new Error('Falha ao ler o formato da planilha: ' + fallbackErr.message);
    }

    return workbook;
  },

  /**
   * Extrai o nome limpo do condomínio a partir do nome do arquivo
   * Ex: "uCondo_Aquarela_AGUA.xlsx" -> "Aquarela"
   * Ex: "uCondo - Residencial Paineiras - Geral.xlsx" -> "Residencial Paineiras"
   * Ex: "Consumo_Morada_do_Sol.csv" -> "Morada do Sol"
   */
  extrairNomeCondominioDeArquivo(nomeArquivo) {
    if (!nomeArquivo) return '';
    let limpo = String(nomeArquivo).replace(/\.[^/.]+$/, ''); // Remove extensão

    // Remove prefixos comuns do uCondo / exportações e padrões como "doc"
    limpo = limpo.replace(/^(ucondo|u_condo|consumos|consumo|planilha|leituras|leitura|doc)[_\-\s]*/i, '');

    // Remove sufixos de serviços / datas comuns
    limpo = limpo.replace(/[_\-\s]*(agua|gas|energia|geral|consumos|consumo|\d{4}[_\-]?\d{2}[_\-]?\d{2}|\d{6,14})$/i, '');

    // Remove padrões do WhatsApp como WA0010, WA0001
    limpo = limpo.replace(/[_\-\s]*WA\d+[_\-\s]*/i, '');

    // Substitui underscores e hífens repetidos por espaços
    limpo = limpo.replace(/[_\-]+/g, ' ').trim();

    return limpo || '';
  },

  /**
   * Normaliza o tipo de leitura extraído para compatibilidade com o cadastro do Supabase.
   */
  normalizarTipoLeitura(tipoBruto) {
    let tipoNormalizado = "Água e Gás"; // Valor padrão para cadastro de condomínio
    const tipo = String(tipoBruto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    if (tipo.includes('agua') && tipo.includes('gas')) {
      tipoNormalizado = "Água e Gás";
    } else if (tipo.includes('agua') || tipo.includes('somente agua')) {
      tipoNormalizado = "Somente Água";
    } else if (tipo.includes('gas') || tipo.includes('somente gas')) {
      tipoNormalizado = "Somente Gás";
    } else if (tipo.includes('energia')) {
      tipoNormalizado = "Energia Elétrica";
    }

    return tipoNormalizado;
  },

  /**
   * Converte o tipo de leitura normalizado para o código de serviço ('AGUA'|'GAS'|'ENERGIA'|null).
   * NUNCA retorna 'AGUA' silenciosamente se o tipo for ambíguo.
   * @param {string} tipoNormalizado
   * @returns {'AGUA'|'GAS'|'ENERGIA'|null}
   */
  normalizarTipoLeituraParaServico(tipoNormalizado) {
    return extrairServicoDeTexto(tipoNormalizado);
  },

  /**
   * Extrai pares {unidade, leituraAnterior?} e os metadados (nome e serviço) delegando ao módulo puro.
   * @param {ArrayBuffer|Uint8Array|string|object} fileDataOuWorkbook
   * @returns {{ pares: Array<{unidade: string, leituraAnterior: number|null}>, metadados: {nome: string, tipoMedicao: string, servico: 'AGUA'|'GAS'|'ENERGIA'|null} }}
   */
  analisarPlanilhaCompleta(fileDataOuWorkbook) {
    if (!fileDataOuWorkbook) {
      throw new Error('Nenhum dado de arquivo fornecido para importação.');
    }
    const workbook = (fileDataOuWorkbook && fileDataOuWorkbook.SheetNames)
      ? fileDataOuWorkbook
      : this.lerWorkbook(fileDataOuWorkbook);
    return analisarPlanilhaCompleta(workbook);
  },

  /**
   * Extrai pares {unidade, leituraAnterior?} de forma cronológica por unidade delegando ao módulo puro.
   * @param {ArrayBuffer|Uint8Array|string|object} fileDataOuWorkbook
   * @returns {Array<{unidade: string, leituraAnterior: number|null}>}
   */
  extrairUnidadesELeituras(fileDataOuWorkbook) {
    if (!fileDataOuWorkbook) {
      throw new Error('Nenhum dado de arquivo fornecido para importação.');
    }
    const workbook = (fileDataOuWorkbook && fileDataOuWorkbook.SheetNames)
      ? fileDataOuWorkbook
      : this.lerWorkbook(fileDataOuWorkbook);
    return extrairUnidadesELeituras(workbook);
  },

  /**
   * Extrai metadados do cabeçalho da planilha delegando ao módulo puro.
   * @param {Array<Array<any>>} rawData
   * @param {string} [nomeArquivo='']
   * @returns {{ nome: string, tipoMedicao: string, servico: 'AGUA'|'GAS'|'ENERGIA'|null }}
   */
  extrairMetadadosPlanilha(rawData, nomeArquivo = '') {
    return extrairMetadadosPlanilha(rawData, nomeArquivo);
  },

  /**
   * Extrai estritamente a lista de nomes de Unidades (compatibilidade retroativa).
   * @param {ArrayBuffer|Uint8Array|string} fileData
   * @returns {Array<string>}
   */
  extrairUnidades(fileData) {
    return this.extrairUnidadesELeituras(fileData).map(p => p.unidade);
  },

  /**
   * Extrai estritamente a lista de nomes de Unidades (compatibilidade retroativa).
   * @param {ArrayBuffer|Uint8Array|string} fileData
   * @returns {Array<string>}
   */
  extrairUnidades(fileData) {
    return this.extrairUnidadesELeituras(fileData).map(p => p.unidade);
  },

  /**
   * Salva a lista de unidades e leituras anteriores no LocalStorage e Filesystem (Offline-First).
   * As leituras anteriores são gravadas na gaveta canônica já consumida pelo LeituraFotoModal:
   *   `leituras_anteriores_${condominioId}`  — array [{unidade, leitura_anterior, leitura_anterior_gas, leitura_anterior_energia}]
   * e na gaveta por serviço:
   *   `leituras_anteriores_${condominioId}_AGUA` etc.
   *
   * Regra de segurança:
   * - Se houver leituras e o serviço for nulo ou ambíguo, interrompe ANTES de gravar qualquer gaveta.
   * - NÃO sobrescreve leitura_anterior com 0 quando o valor da planilha está ausente.
   *
   * @param {string|number} condominioId
   * @param {Array<string|{unidade:string,leituraAnterior:number|null}>} unidades
   * @param {'AGUA'|'GAS'|'ENERGIA'|null} [servico=null]
   */
  async persistirUnidadesLocal(condominioId, unidades, servico = null) {
    if (!condominioId || !Array.isArray(unidades)) return;

    // Normaliza entrada: aceita string pura (compatibilidade) ou objeto {unidade, leituraAnterior}
    const pares = unidades.map(item => {
      if (typeof item === 'string') return { unidade: String(item).trim(), leituraAnterior: null };
      return { unidade: String(item.unidade ?? item).trim(), leituraAnterior: item.leituraAnterior ?? null };
    });

    const nomesUnidades = pares.map(p => p.unidade);
    const temLeituras = pares.some(p => p.leituraAnterior !== null);

    // REGRA DE SEGURANÇA: Se a planilha trouxer leituras, o serviço DEVE ser inequívoco.
    // Interrompe ANTES de gravar qualquer gaveta se o serviço for ambíguo / nulo.
    const servicoValido = (servico === 'AGUA' || servico === 'GAS' || servico === 'ENERGIA') ? servico : null;
    if (temLeituras && !servicoValido) {
      throw new Error(
        'Serviço ambíguo ou não identificado. Para importar leituras anteriores, utilize uma planilha que identifique expressamente Água, Gás ou Energia.'
      );
    }

    // 1. LocalStorage — lista de unidades
    const storageKey = `unidades_${condominioId}`;
    localStorage.setItem(storageKey, JSON.stringify(nomesUnidades));

    // 2. Filesystem — persistência permanente
    const fileName = `unidades_${condominioId}.json`;
    await salvarArquivoSeguro(fileName, JSON.stringify(nomesUnidades));

    // 3. Gaveta unificada de leituras anteriores (somente se houver leituras e serviço válido)
    if (temLeituras && servicoValido) {
      const chaveLeituras = `leituras_anteriores_${condominioId}`;
      let gaveta = [];
      try {
        const raw = localStorage.getItem(chaveLeituras);
        if (raw) gaveta = JSON.parse(raw) || [];
        if (!Array.isArray(gaveta)) gaveta = [];
        gaveta = deduplicarGavetaAnteriores(gaveta);
      } catch { gaveta = []; }

      const propServico = servicoValido === 'GAS' ? 'leitura_anterior_gas'
        : servicoValido === 'ENERGIA' ? 'leitura_anterior_energia'
        : 'leitura_anterior';

      for (const par of pares) {
        const idx = gaveta.findIndex(g => String(g.unidade).trim() === par.unidade);
        if (idx !== -1) {
          // Unidade já existe na gaveta — atualiza só se a planilha trouxe valor
          if (par.leituraAnterior !== null) {
            gaveta[idx] = { ...gaveta[idx], unidade: par.unidade, [propServico]: par.leituraAnterior };
          } else {
            gaveta[idx] = { ...gaveta[idx], unidade: par.unidade };
          }
        } else {
          // Unidade nova: só adiciona leitura se vier da planilha
          const entrada = { unidade: par.unidade };
          if (par.leituraAnterior !== null) entrada[propServico] = par.leituraAnterior;
          gaveta.push(entrada);
        }
      }
      localStorage.setItem(chaveLeituras, JSON.stringify(gaveta));

      // 4. Gaveta por serviço consumida por telas específicas
      const chaveServico = `leituras_anteriores_${condominioId}_${servicoValido}`;
      const leiturasParaFila = pares
        .filter(p => p.leituraAnterior !== null)
        .map(p => ({ unidade: p.unidade, leitura_anterior: p.leituraAnterior }));

      localStorage.setItem(chaveServico, JSON.stringify(leiturasParaFila));
      // Enfileira para sincronização com Supabase (tabela unidades_leituras) via offline queue
      enfileirarLeiturasAnteriores(String(condominioId), leiturasParaFila, servicoValido);
    }

    // Notifica LeituraFotoModal e outros componentes para reidratar a tela instantaneamente
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline_cache_hydrated', { detail: { condId: String(condominioId) } }));
    }

    // 5. Supabase — insert de unidades em background (fire-and-forget)
    if (supabase) {
      try {
        const unidadesParaInserir = nomesUnidades.map(nome => ({
          condominio_id: condominioId,
          nome,
          numero: nome,
          identificador: nome,
          status: 'pendente',
        }));
        supabase
          .from('unidades')
          .delete()
          .eq('condominio_id', condominioId)
          .then(() => supabase.from('unidades').insert(unidadesParaInserir))
          .catch(() => {});
      } catch { /* Silencioso */ }
    }
  },

  /**
   * Processamento Inteligente para a Aba de Cadastro ("Selecionar e Importar Planilha")
   */
  async processarPlanilhaCadastro(nomeArquivo, fileData, condominiosExistentes = []) {
    try {
      // 1. Ler o arquivo de forma segura e extrair dados via módulo puro
      const workbook = this.lerWorkbook(fileData);
      const { pares, metadados } = this.analisarPlanilhaCompleta(workbook);
      const unidades = pares.map(p => p.unidade);
      const temLeituras = pares.some(p => p.leituraAnterior !== null);
      const servicoPlanilha = metadados?.servico || null;

      if (unidades && unidades.length > 0) {
        // Se a planilha contém leituras, mas o serviço é ambíguo, interrompe antes de persistir
        if (temLeituras && !servicoPlanilha) {
          await customAlert(
            '⚠️ A planilha contém leituras anteriores, mas não foi possível identificar de forma segura se pertencem a Água, Gás ou Energia.\n\nPor favor, importe uma planilha que identifique expressamente o serviço (ex: "Consumo de: Água" ou "Consumo de: Gás").'
          );
          return { cancelado: true };
        }

        let nomeExtraido = metadados.nome;

        if (!nomeExtraido) {
          // Fallback Inteligente Anti-Card Fantasma:
          const nomeSugerido = this.extrairNomeCondominioDeArquivo(nomeArquivo);
          nomeExtraido = await customPrompt(
            'Não encontramos o nome "Condomínio" na planilha. Para evitar duplicações, confirme o nome exato do condomínio que deseja atualizar (ex: São Bento) ou criar:',
            nomeSugerido
          );
          if (!nomeExtraido || !nomeExtraido.trim()) {
            return { cancelado: true };
          }
        }
        nomeExtraido = nomeExtraido.trim();
        const nomeLimpoPlanilha = normalizarNome(nomeExtraido);

        let condExistente = null;

        // 2. Busca flexível no Supabase (Fonte da Verdade)
        if (supabase && nomeLimpoPlanilha && navigator.onLine) {
          try {
            const { data: todosConds, error: fetchError } = await supabase
              .from('condominios')
              .select('*');

            if (!fetchError && Array.isArray(todosConds)) {
              condExistente = todosConds.find(c => {
                const nomeBanco = normalizarNome(c.nome);
                if (!nomeBanco || !nomeLimpoPlanilha) return false;

                if (nomeBanco === nomeLimpoPlanilha || nomeBanco.includes(nomeLimpoPlanilha) || nomeLimpoPlanilha.includes(nomeBanco)) {
                  return true;
                }

                const distancia = calcularDistanciaLevenstein(nomeBanco, nomeLimpoPlanilha);
                if (nomeLimpoPlanilha.length > 8 && distancia <= 2) {
                  return true;
                }

                return false;
              }) || null;
            }
          } catch (errDb) {
          }
        }

        // 3. Fallback de checagem na lista em memória ou cache local
        if (!condExistente && nomeLimpoPlanilha) {
          let listaLocal = Array.isArray(condominiosExistentes) && condominiosExistentes.length > 0 ? condominiosExistentes : [];
          if (listaLocal.length === 0) {
            try {
              const cacheData = localStorage.getItem('condominios_cache');
              if (cacheData) listaLocal = JSON.parse(cacheData) || [];
            } catch (e) {}
          }
          condExistente = listaLocal.find(c => {
            const nomeBanco = normalizarNome(c.nome);
            if (!nomeBanco || !nomeLimpoPlanilha) return false;

            if (nomeBanco === nomeLimpoPlanilha || nomeBanco.includes(nomeLimpoPlanilha) || nomeLimpoPlanilha.includes(nomeBanco)) {
              return true;
            }

            const distancia = calcularDistanciaLevenstein(nomeBanco, nomeLimpoPlanilha);
            if (nomeLimpoPlanilha.length > 8 && distancia <= 2) {
              return true;
            }

            return false;
          }) || null;
        }

        // 4. Se o condomínio já existe: Pergunta se deseja substituir
        if (condExistente) {
          const querSubstituir = await customConfirmDestrutivo(
            `Planilha identificada. Foram encontradas ${unidades.length} unidades. Deseja substituir a lista no condomínio '${condExistente.nome}'?`,
            "Substituir Unidades",
            "Substituir"
          );

          if (!querSubstituir) {
            return { cancelado: true };
          }

          // Atualiza as unidades locais no serviço correto
          await this.persistirUnidadesLocal(condExistente.id, pares, servicoPlanilha);

          // Atualiza contagem no Supabase
          if (supabase) {
            try {
              await supabase
                .from('condominios')
                .update({
                  apartamentos: unidades.length
                })
                .eq('id', condExistente.id);
            } catch (_) {}
          }

          return {
            tipo: 'atualizado',
            condominio: condExistente,
            totalUnidades: unidades.length,
          };
        } else {
          // 5. Se NÃO existe: Cria novo condomínio
          const tipoLeituraCondominio = servicoPlanilha === 'GAS' ? 'Somente Gás'
            : servicoPlanilha === 'ENERGIA' ? 'Energia Elétrica'
            : servicoPlanilha === 'AGUA' ? 'Somente Água'
            : this.normalizarTipoLeitura(metadados.tipoMedicao);

          const novoCondominioData = {
            nome: nomeExtraido,
            tipoLeitura: tipoLeituraCondominio,
            diaLeitura: '10',
            apartamentos: unidades.length,
            valor: 0,
            endereco: '',
            instrucoesAcesso: '',
            contatoSindico: '',
          };

          let condominioSalvo;
          try {
            condominioSalvo = await salvarCondominio(novoCondominioData);
            if (!condominioSalvo || !condominioSalvo.id) {
              throw new Error('Não foi possível salvar o novo condomínio no Supabase.');
            }
          } catch (err) {
            if (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('sessão')) {
              const offId = crypto.randomUUID ? crypto.randomUUID() : `off_${Date.now()}`;
              condominioSalvo = {
                ...novoCondominioData,
                id: offId,
                data: new Date().toISOString(),
                completo: false
              };
              enfileirarNovoCondominio(condominioSalvo);
            } else {
              throw err;
            }
          }

          // Insere todas as unidades extraídas com o ID gerado e persiste leituras anteriores
          await this.persistirUnidadesLocal(condominioSalvo.id, pares, servicoPlanilha);

          return {
            tipo: 'criado',
            condominio: condominioSalvo,
            totalUnidades: unidades.length,
          };
        }
      }

      // Se não encontrou unidades
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false, blankrows: false });
      if (!rows || rows.length === 0) {
        throw new Error('A planilha selecionada está vazia ou ilegível.');
      }

      throw new Error('Nenhuma coluna de Unidades do uCondo nem lista de condomínios válida encontrada.');
    } catch (error) {
      throw error;
    }
  },

  /**
   * Atualização / Substituição de Unidades de Condomínio Existente
   */
  async atualizarUnidadesCondominio(condominioId, fileData, unidadesAtuais = [], condominoAtualNome = '') {
    try {
      let workbook;
      try {
        workbook = this.lerWorkbook(fileData);
      } catch (e) {
        throw new Error('Falha ao ler a planilha: ' + e.message);
      }

      // 1. Extração estruturada de pares e metadados via módulo puro
      const { pares, metadados } = this.analisarPlanilhaCompleta(workbook);
      const novasUnidades = pares.map(p => p.unidade);
      const servico = metadados?.servico || null;
      const temLeituras = pares.some(p => p.leituraAnterior !== null);

      if (temLeituras && !servico) {
        await customAlert(
          '⚠️ Não foi possível identificar com segurança se as medições desta planilha pertencem a Água, Gás ou Energia.\n\nPor favor, importe uma planilha do uCondo que identifique expressamente o serviço (ex: "Consumo de: Água" ou "Consumo de: Gás").'
        );
        return null;
      }

      // 2. Validação de Segurança: Checa se o nome de dentro do Excel bate com o condomínio atual
      if (metadados.nome && condominoAtualNome) {
        const nomePlanilhaNorm = normalizarNome(metadados.nome);
        const nomeAtualNorm = normalizarNome(condominoAtualNome);

        const temCorrespondencia = nomePlanilhaNorm.includes(nomeAtualNorm) || nomeAtualNorm.includes(nomePlanilhaNorm);

        if (!temCorrespondencia) {
          const confirmarDivergencia = await customConfirm(
            `⚠️ Aviso de Segurança:\nA planilha selecionada é do condomínio "${metadados.nome}", mas você está no condomínio "${condominoAtualNome}".\n\nDeseja realmente vincular estas ${novasUnidades.length} unidades aqui?`
          );
          if (!confirmarDivergencia) {
            return null;
          }
        }
      }

      if (unidadesAtuais && unidadesAtuais.length > 0) {
        const confirmar = await customConfirmDestrutivo(
          `Este condomínio já possui ${unidadesAtuais.length} unidades cadastradas.\n\nDeseja substituir a lista atual pelas ${novasUnidades.length} unidades da nova planilha?`,
          "Substituir Unidades",
          "Substituir"
        );
        if (!confirmar) {
          return null;
        }
      }

      // 3. Persistência canônica
      await this.persistirUnidadesLocal(condominioId, pares, servico);

      return {
        unidades: novasUnidades,
        servico,
        totalLeituras: pares.filter(p => p.leituraAnterior !== null).length,
      };
    } catch (error) {
      throw error;
    }
  }
};

export default UCondoImportService;

