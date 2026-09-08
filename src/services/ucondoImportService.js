import * as XLSX from 'xlsx';
import { salvarArquivoSeguro } from './filesystemService';
import { salvarCondominio } from './condominioService';
import { supabase } from './supabase';
import { customPrompt, customConfirm, customConfirmDestrutivo } from '../components/CustomPrompt/CustomPrompt';
import { enfileirarLeiturasAnteriores, enfileirarNovoCondominio } from './syncOfflineService';

/**
 * Normaliza o nome do condomínio removendo acentos, múltiplos espaços,
 * caracteres invisíveis e convertendo para minúsculas para comparação 100% precisa.
 */
export const normalizarNome = (txt) => {
  if (!txt) return '';
  return String(txt)
    .toLowerCase()
    .normalize('NFD') // Separa os acentos das letras
    .replace(/[\u0300-\u036f]/g, '') // Remove os acentos
    .replace(/[^a-z0-9]/g, ''); // Remove tudo que não for letra ou número (espaços, hífens, acentos)
};

/**
 * Calcula a distância de Levenshtein (edições necessárias) entre duas strings.
 * Útil para Fuzzy Match (ex: rogerioloch vs rogeriolock).
 */
export const calcularDistanciaLevenstein = (a, b) => {
  if (!a || !a.length) return (b || '').length;
  if (!b || !b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
};

/**
 * Serviço Sênior Modular para Importação Mágica de planilhas do uCondo.
 */
export const UCondoImportService = {
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
   * Normaliza o tipo de leitura extraído para evitar violar a constraint do Supabase.
   */
  normalizarTipoLeitura(tipoBruto) {
    let tipoNormalizado = "Água e Gás"; // Valor padrão seguro
    const tipo = String(tipoBruto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    if (tipo.includes('agua') && tipo.includes('gas')) {
      tipoNormalizado = "Água e Gás";
    } else if (tipo.includes('somente agua') || tipo === 'agua') {
      tipoNormalizado = "Somente Água";
    } else if (tipo.includes('somente gas') || tipo === 'gas') {
      tipoNormalizado = "Somente Gás";
    } else if (tipo.includes('energia')) {
      tipoNormalizado = "Energia Elétrica";
    }

    return tipoNormalizado;
  },

  /**
   * Converte o tipo de leitura normalizado para o código de serviço usado no localStorage e na fila.
   * @param {string} tipoNormalizado - Ex: "Somente Água", "Somente Gás", "Energia Elétrica", "gua" (bruto)
   * @returns {'AGUA'|'GAS'|'ENERGIA'}
   */
  normalizarTipoLeituraParaServico(tipoNormalizado) {
    const t = String(tipoNormalizado || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (t.includes('gas') || t === 'somente gas') return 'GAS';
    if (t.includes('energia') || t === 'energia eletrica') return 'ENERGIA';
    return 'AGUA'; // padrão seguro para água ou água+gás
  },

  /**
   * Determina se uma string normalizada de cabeçalho corresponde à coluna de Unidade.
   * @param {string} str - String já normalizada (NFD + lowercase + trim)
   * @returns {boolean}
   */
  _ehColunaUnidade(str) {
    if (!str) return false;
    // Aliases inequivocamente de unidade: includes para variações com sufixos/prefixos
    if (str.includes('unidade')) return true;      // unidade, unidades, unidade (m²), unidade *
    if (str.includes('apartamento')) return true;  // apartamento, numero apartamento
    if (str.includes('apto')) return true;         // apto, apto., nº apto, numero apto
    // Aliases curtos — exact match ou prefixo claro para evitar falso positivo
    if (str === 'ap' || str === 'ap.' || str === 'ap ') return true;
    if (str === 'unid') return true;
    if (str === 'numero' || str === 'numero apto' || str === 'numero do apto') return true;
    if (str === 'identificador') return true;
    if (str === 'n apto' || str === 'no apto' || str === 'no apartamento') return true;
    // NÃO incluir: 'bloco', 'codigo', 'cod', 'n', 'num' — muito genéricos
    return false;
  },

  /**
   * Determina se uma string normalizada de cabeçalho corresponde à coluna de Leitura Anterior.
   * @param {string} str - String já normalizada (NFD + lowercase + trim)
   * @returns {boolean}
   */
  _ehColunaLeituraAnterior(str) {
    if (!str) return false;
    if (str.includes('anterior')) return true;          // leitura anterior, leitura ant, anterior
    if (str.includes('fechamento')) return true;        // fechamento (relatório uCondo)
    if (str === 'medicao anterior') return true;
    if (str === 'medicao ant') return true;
    if (str === 'leitura') return true;                 // quando há somente "Leitura" sem "Atual"
    // IMPORTANTE: só aceitar 'leitura' sozinho se NÃO existir coluna 'leitura atual' na mesma linha
    // — essa lógica é aplicada em extrairUnidadesELeituras() com desempate
    return false;
  },

  /**
   * Tenta extrair {ano, mes} de um cabeçalho datado no formato:
   *   "Leitura de Jul/2026", "Leitura de Agosto/2026", "Leitura de 08/2026"
   *   "Leitura 08/2026" (sem "de"), variações com espaço como separador.
   * Retorna null se não for um cabeçalho de leitura datada válido.
   * @param {string} str - String já normalizada (NFD + lowercase + trim)
   * @returns {{ano: number, mes: number}|null}
   */
  _extrairDataColunaLeitura(str) {
    if (!str) return null;
    // Aceita 'leitura de ...' e também 'leitura ...' (sem 'de')
    // Rejeita inequivocamente: anterior, atual, fechamento, consumo, valor
    if (!str.startsWith('leitura')) return null;
    if (str.includes('anterior') || str.includes('fechamento') ||
        str.includes('atual') || str.includes('consumo') || str.includes('valor')) return null;

    // Extrai a parte após 'leitura de ' ou 'leitura '
    let parte = str.replace(/^leitura\s+de\s+/, '').replace(/^leitura\s+/, '').trim();

    // Tabela: 3 primeiros chars do nome → número (cobre abreviados e completos)
    const MESES = {
      jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
      jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
    };

    // Formato: nome_mes separado de ano por '/', '-' ou espaço
    // Aceita: jul/2026  agosto/2026  agosto 2026  jul-2026
    const matchNome = parte.match(/^([a-z]{3,})[\s\/\-](\d{2,4})$/);
    if (matchNome) {
      const mesAbrev = matchNome[1].substring(0, 3);
      const mesNum = MESES[mesAbrev];
      if (!mesNum) return null; // ex: 'foo' → null
      let ano = parseInt(matchNome[2], 10);
      if (ano < 100) ano += 2000;
      return { ano, mes: mesNum };
    }

    // Formato numérico: 08/2026  08-2026  08 2026
    const matchNum = parte.match(/^(\d{1,2})[\s\/\-](\d{2,4})$/);
    if (matchNum) {
      const mes = parseInt(matchNum[1], 10);
      let ano = parseInt(matchNum[2], 10);
      if (ano < 100) ano += 2000;
      if (mes < 1 || mes > 12) return null;
      return { ano, mes };
    }

    return null;
  },

  /**
   * Extrai pares {unidade, leituraAnterior?} de um arquivo XLSX/CSV.
   * Preserva a associação linha-a-linha para garantir que a leitura pertence à unidade correta.
   *
   * @param {ArrayBuffer|Uint8Array|string} fileData - Conteúdo do arquivo
   * @returns {Array<{unidade: string, leituraAnterior: number|null}>}
   */
  extrairUnidadesELeituras(fileData) {
    if (!fileData) {
      throw new Error('Nenhum dado de arquivo fornecido para importação.');
    }

    let workbook;
    try {
      if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        const base64Content = fileData.split(',')[1] || fileData;
        workbook = XLSX.read(base64Content, { type: 'base64' });
      } else if (typeof fileData === 'string') {
        workbook = XLSX.read(fileData, { type: 'binary' });
      } else if (fileData instanceof ArrayBuffer) {
        const uint8 = new Uint8Array(fileData);
        workbook = XLSX.read(uint8, { type: 'array' });
      } else if (fileData instanceof Uint8Array) {
        workbook = XLSX.read(fileData, { type: 'array' });
      } else {
        workbook = XLSX.read(fileData, { type: 'array' });
      }
    } catch (readErr) {
      try {
        workbook = XLSX.read(fileData, { type: 'binary' });
      } catch (fallbackErr) {
        throw new Error('Falha ao ler o formato da planilha: ' + fallbackErr.message);
      }
    }

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Arquivo de planilha inválido ou sem abas.');
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      throw new Error('A planilha selecionada está vazia.');
    }

    let headerIndex = -1;
    let columnUnidadeIndex = -1;
    let columnLeituraIndex = -1; // -1 = não encontrada

    // 1. Busca dinâmica nas primeiras 25 linhas
    for (let i = 0; i < Math.min(25, rawData.length); i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      let unidadeIdx = -1;
      let anteriorIdx = -1;
      let leituraGenicaIdx = -1;  // apenas 'leitura' sem qualificador
      let leituraAtualIdx = -1;   // 'leitura atual' — desempate para não usar como anterior
      // Colunas datadas: {idx, ano, mes}
      const colunasDatadas = [];

      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell === null || cell === undefined) continue;
        const str = String(cell).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (str === '') continue;

        if (unidadeIdx === -1 && this._ehColunaUnidade(str)) {
          unidadeIdx = c;
          continue;
        }
        // Detecta 'leitura atual' antes de 'leitura' genérico
        if ((str === 'leitura atual' || str === 'atual' || str.startsWith('leitura atual'))) {
          leituraAtualIdx = c;
          continue;
        }
        // Tenta cabeçalho datado: "Leitura de Jul/2026"
        const dataCol = this._extrairDataColunaLeitura(str);
        if (dataCol) {
          colunasDatadas.push({ idx: c, ...dataCol });
          continue;
        }
        if (anteriorIdx === -1 && this._ehColunaLeituraAnterior(str) && str !== 'leitura') {
          anteriorIdx = c;
          continue;
        }
        if (str === 'leitura') {
          leituraGenicaIdx = c;
        }
      }

      if (unidadeIdx !== -1) {
        headerIndex = i;
        columnUnidadeIndex = unidadeIdx;
        // Resolve coluna de leitura:
        // Prioridade 1: colunas datadas → selecionar a de DATA MAIS RECENTE (independente da posição)
        if (colunasDatadas.length > 0) {
          colunasDatadas.sort((a, b) => a.ano !== b.ano ? b.ano - a.ano : b.mes - a.mes);
          columnLeituraIndex = colunasDatadas[0].idx;
        } else if (anteriorIdx !== -1) {
          // Prioridade 2: alias inequívoco de leitura anterior
          columnLeituraIndex = anteriorIdx;
        } else if (leituraGenicaIdx !== -1 && leituraAtualIdx === -1) {
          // Prioridade 3: 'leitura' genérico só quando não há 'leitura atual'
          columnLeituraIndex = leituraGenicaIdx;
        }
        break;
      }
    }

    let pares = [];

    if (headerIndex !== -1 && columnUnidadeIndex !== -1) {
      for (let i = headerIndex + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;
        const cellVal = row[columnUnidadeIndex];
        if (cellVal === undefined || cellVal === null) continue;
        const nomeUnidade = String(cellVal).trim();
        if (!nomeUnidade || nomeUnidade.toLowerCase().includes('total') || nomeUnidade.toLowerCase().includes('legenda')) continue;

        let leituraAnterior = null;
        if (columnLeituraIndex !== -1) {
          const cellLeit = row[columnLeituraIndex];
          if (cellLeit !== undefined && cellLeit !== null && String(cellLeit).trim() !== '') {
            // Trata vírgula decimal e zeros à esquerda
            const valorStr = String(cellLeit).trim().replace(/[^0-9,.-]/g, '').replace(',', '.');
            const num = parseFloat(valorStr);
            if (!isNaN(num)) leituraAnterior = num;
          }
        }

        pares.push({ unidade: nomeUnidade, leituraAnterior });
      }
    }

    // 2. Fallback de varredura por padrões (só unidades, sem leitura) se cabeçalho não encontrado
    if (pares.length === 0) {
      rawData.forEach((row, rIdx) => {
        if (rIdx < 2 && rawData.length > 5) return;
        if (Array.isArray(row)) {
          row.forEach(cell => {
            if (cell === null || cell === undefined) return;
            const val = String(cell).trim();
            if (!val) return;
            if (/^[A-Za-z0-9]+[-/][A-Za-z0-9]+$/.test(val) || /^([A-Za-z]+\s*)?\d{2,4}$/i.test(val)) {
              pares.push({ unidade: val, leituraAnterior: null });
            }
          });
        }
      });
    }

    // Remove duplicatas de unidade preservando ordem
    const vistas = new Set();
    const paresUnicos = pares.filter(p => {
      const key = String(p.unidade).trim();
      if (vistas.has(key)) return false;
      vistas.add(key);
      return true;
    });

    if (paresUnicos.length === 0) {
      throw new Error('Não foi possível identificar a coluna de unidades da planilha. Verifique se existe uma coluna com cabeçalho Unidade, Apto ou Apartamento.');
    }

    return paresUnicos;
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
   *   `leituras_anteriores_${condominioId}`  — array [{unidade, leitura_anterior, leitura_anterior_gas}]
   * e na gaveta por serviço:
   *   `leituras_anteriores_${condominioId}_AGUA` — para compatibilidade com App.jsx
   *
   * Regra de segurança: NÃO sobrescreve leitura_anterior com 0 quando o valor da planilha está ausente.
   *
   * @param {string|number} condominioId
   * @param {Array<string|{unidade:string,leituraAnterior:number|null}>} unidades
   *   Aceita lista de strings (compatibilidade) ou lista de pares {unidade, leituraAnterior}.
   * @param {string} [servico='AGUA'] - 'AGUA' | 'GAS' | 'ENERGIA'
   */
  async persistirUnidadesLocal(condominioId, unidades, servico = 'AGUA') {
    if (!condominioId || !Array.isArray(unidades)) return;

    // Normaliza entrada: aceita string pura (compatibilidade) ou objeto {unidade, leituraAnterior}
    const pares = unidades.map(item => {
      if (typeof item === 'string') return { unidade: String(item).trim(), leituraAnterior: null };
      return { unidade: String(item.unidade ?? item).trim(), leituraAnterior: item.leituraAnterior ?? null };
    });

    const nomesUnidades = pares.map(p => p.unidade);
    const temLeituras = pares.some(p => p.leituraAnterior !== null);

    // 1. LocalStorage — lista de unidades
    const storageKey = `unidades_${condominioId}`;
    localStorage.setItem(storageKey, JSON.stringify(nomesUnidades));

    // 2. Filesystem — persistência permanente
    const fileName = `unidades_${condominioId}.json`;
    await salvarArquivoSeguro(fileName, JSON.stringify(nomesUnidades));

    // 3. Gaveta unificada de leituras anteriores (`leituras_anteriores_${condominioId}`)
    //    Lida diretamente pelo LeituraFotoModal. Não sobrescreve leitura com 0.
    const chaveLeituras = `leituras_anteriores_${condominioId}`;
    let gaveta = [];
    try {
      const raw = localStorage.getItem(chaveLeituras);
      if (raw) gaveta = JSON.parse(raw) || [];
      if (!Array.isArray(gaveta)) gaveta = [];
    } catch { gaveta = []; }

    const propServico = servico === 'GAS' ? 'leitura_anterior_gas'
      : servico === 'ENERGIA' ? 'leitura_anterior_energia'
      : 'leitura_anterior';

    for (const par of pares) {
      const idx = gaveta.findIndex(g => String(g.unidade).trim() === par.unidade);
      if (idx !== -1) {
        // Unidade já existe na gaveta — atualiza só se a planilha trouxe valor
        if (par.leituraAnterior !== null) {
          gaveta[idx] = { ...gaveta[idx], unidade: par.unidade, [propServico]: par.leituraAnterior };
        } else {
          // Garante que unidade existe na gaveta sem sobrescrever leitura existente
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

    // 4. Gaveta por serviço (`leituras_anteriores_${condominioId}_AGUA` etc.) — consumida por App.jsx
    //    Só grava e enfileira para sync se a planilha trouxe leituras reais.
    if (temLeituras) {
      const chaveServico = `leituras_anteriores_${condominioId}_${servico}`;
      const leiturasParaFila = pares
        .filter(p => p.leituraAnterior !== null)
        .map(p => ({ unidade: p.unidade, leitura_anterior: p.leituraAnterior }));

      localStorage.setItem(chaveServico, JSON.stringify(leiturasParaFila));
      // Enfileira para sincronização com Supabase (tabela unidades_leituras) via offline queue
      enfileirarLeiturasAnteriores(String(condominioId), leiturasParaFila, servico);
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
   * Extrai metadados do cabeçalho da planilha uCondo (Nome do Condomínio e Consumo de / Tipo de Medição)
   */
  extrairMetadadosPlanilha(rawData, nomeArquivo) {
    let nomeExtraido = '';
    let tipoMedicaoExtraido = 'Água e Gás'; // Valor padrão fallback

    if (Array.isArray(rawData)) {
      for (let i = 0; i < Math.min(15, rawData.length); i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;

        for (let j = 0; j < row.length; j++) {
          const cellValue = String(row[j] || '').trim().toLowerCase();

          // Busca "Condomínio" e pega o valor da próxima coluna
          if (cellValue.includes('condomínio') || cellValue.includes('condominio')) {
            if (row[j + 1] !== undefined && row[j + 1] !== null && String(row[j + 1]).trim() !== '') {
              // Remove asteriscos que o uCondo coloca no nome
              nomeExtraido = String(row[j + 1]).replace(/\*/g, '').trim();
            }
          }

          // Busca "Consumo de" e pega o valor da próxima coluna (ex: Gás, Água)
          if (cellValue.includes('consumo de') || cellValue.includes('tipo de leitura') || cellValue.includes('tipo de medicao') || cellValue.includes('tipo de medição')) {
            if (row[j + 1] !== undefined && row[j + 1] !== null && String(row[j + 1]).trim() !== '') {
              const tipoStr = String(row[j + 1]).replace(/\*/g, '').trim();
              tipoMedicaoExtraido = this.normalizarTipoLeitura(tipoStr);
            }
          }
        }
      }
    }

    // Remove o fallback automático para forçar o prompt em processarPlanilhaCadastro
    // se o nome não for encontrado nas células, evitando cards fantasmas.
    // O nome do arquivo será usado como sugestão no prompt.

    return {
      nome: nomeExtraido,
      tipoMedicao: tipoMedicaoExtraido,
    };
  },

  /**
   * Processamento Inteligente para a Aba de Cadastro ("Selecionar e Importar Planilha")
   * Suporta:
   * 1. Extração de metadados direto das células ("Condomínio" e "Consumo de")
   * 2. Consulta explícita de duplicidade no Supabase com .ilike()
   * 3. Criação / Substituição de condomínio e unidades com batch insert
   */
  async processarPlanilhaCadastro(nomeArquivo, fileData, condominiosExistentes = []) {
    try {
      // 1. Ler o arquivo com SheetJS
      let workbook;
      try {
        if (typeof fileData === 'string' && fileData.startsWith('data:')) {
          const base64Content = fileData.split(',')[1] || fileData;
          workbook = XLSX.read(base64Content, { type: 'base64' });
        } else if (typeof fileData === 'string') {
          workbook = XLSX.read(fileData, { type: 'binary' });
        } else if (fileData instanceof ArrayBuffer) {
          const uint8 = new Uint8Array(fileData);
          workbook = XLSX.read(uint8, { type: 'array' });
        } else if (fileData instanceof Uint8Array) {
          workbook = XLSX.read(fileData, { type: 'array' });
        } else {
          workbook = XLSX.read(fileData, { type: 'array' });
        }
      } catch (readErr) {
        workbook = XLSX.read(fileData, { type: 'binary' });
      }

      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('Arquivo de planilha inválido ou sem abas.');
      }

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

      // 2. Extrai unidades (e leituras anteriores, se existirem) no formato uCondo
      let pares = [];
      try {
        pares = this.extrairUnidadesELeituras(fileData);
      } catch (_) {
        pares = [];
      }
      const unidades = pares.map(p => p.unidade);

      // Determina serviço a partir dos metadados (extraído mais abaixo, mas necessário aqui)
      // Se encontrou unidades da planilha uCondo
      if (unidades && unidades.length > 0) {
        // 2.1 Extração dinâmica de metadados das células (Condomínio e Consumo de)
        const metadados = this.extrairMetadadosPlanilha(rawData, nomeArquivo);
        let nomeExtraido = metadados.nome;
        let tipoMedicaoExtraido = this.normalizarTipoLeitura(metadados.tipoMedicao);

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

        // 2.2 Busca flexível no Supabase (Fonte da Verdade) com correspondência parcial bidirecional
        if (supabase && nomeLimpoPlanilha && navigator.onLine) {
          try {
            const { data: todosConds, error: fetchError } = await supabase
              .from('condominios')
              .select('*');

            if (!fetchError && Array.isArray(todosConds)) {
              condExistente = todosConds.find(c => {
                const nomeBanco = normalizarNome(c.nome);
                if (!nomeBanco || !nomeLimpoPlanilha) return false;
                
                // Match perfeito ou Contém
                if (nomeBanco === nomeLimpoPlanilha || nomeBanco.includes(nomeLimpoPlanilha) || nomeLimpoPlanilha.includes(nomeBanco)) {
                  return true;
                }
                
                // Fuzzy Match (Permite até 2 erros de digitação se a string tiver mais de 8 caracteres)
                // Ex: "rogerioloch" vs "rogeriolock" (1 erro)
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

        // 2.3 Fallback de checagem na lista em memória (condominiosExistentes) ou cache local com matching parcial
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

        // 2.4 Se o condomínio já existe: Pergunta se deseja substituir
        if (condExistente) {
          const querSubstituir = await customConfirmDestrutivo(
            `Planilha identificada. Foram encontradas ${unidades.length} unidades. Deseja substituir a lista no condomínio '${condExistente.nome}'?`,
            "Substituir Unidades",
            "Substituir"
          );

          if (!querSubstituir) {
            return { cancelado: true };
          }

          // Atualiza as unidades locais preservando leituras anteriores da planilha
          await this.persistirUnidadesLocal(condExistente.id, pares, this.normalizarTipoLeituraParaServico(tipoMedicaoExtraido));

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
          // 2.5 Se NÃO existe: Cria novo condomínio com nome e tipo de medição extraídos
          const novoCondominioData = {
            nome: nomeExtraido,
            tipoLeitura: this.normalizarTipoLeitura(tipoMedicaoExtraido),
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
            // Fallback Offline-First se falhar a rede (fetch)
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
          await this.persistirUnidadesLocal(condominioSalvo.id, pares, this.normalizarTipoLeituraParaServico(tipoMedicaoExtraido));

          return {
            tipo: 'criado',
            condominio: condominioSalvo,
            totalUnidades: unidades.length,
          };
        }
      }

      // 2. Se não foi detectada como planilha de unidades uCondo, tenta formato geral
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
   * FRENTE 1: Atualização / Substituição de Unidades de Condomínio Existente (com validação de segurança)
   */
  async atualizarUnidadesCondominio(condominioId, fileData, unidadesAtuais = [], condominoAtualNome = '') {
    try {
      // 1. Extração das novas unidades
      const novasUnidades = this.extrairUnidades(fileData);

      // 2. Validação de Segurança: Checa se o nome de dentro do Excel bate com o condomínio atual
      let workbook;
      try {
        if (typeof fileData === 'string' && fileData.startsWith('data:')) {
          const base64Content = fileData.split(',')[1] || fileData;
          workbook = XLSX.read(base64Content, { type: 'base64' });
        } else if (typeof fileData === 'string') {
          workbook = XLSX.read(fileData, { type: 'binary' });
        } else if (fileData instanceof ArrayBuffer) {
          const uint8 = new Uint8Array(fileData);
          workbook = XLSX.read(uint8, { type: 'array' });
        } else if (fileData instanceof Uint8Array) {
          workbook = XLSX.read(fileData, { type: 'array' });
        } else {
          workbook = XLSX.read(fileData, { type: 'array' });
        }

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        
        const metadados = this.extrairMetadadosPlanilha(rawData, '');

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
      } catch (errParse) {
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

      await this.persistirUnidadesLocal(condominioId, novasUnidades);

      return novasUnidades;
    } catch (error) {
      throw error;
    }
  }
};

export default UCondoImportService;

