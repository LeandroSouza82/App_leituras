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
   * Extrai estritamente a coluna de Unidades de um arquivo XLSX/CSV
   * @param {ArrayBuffer|Uint8Array|string} fileData - Conteúdo do arquivo
   * @returns {Array<string>} Lista de unidades extraídas no formato original literal
   */
  extrairUnidades(fileData) {
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
    // Extrai a matriz bruta completa (array de arrays) para ignorar linhas de títulos/offset do uCondo
    const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      throw new Error('A planilha selecionada está vazia.');
    }

    let headerIndex = -1;
    let columnUnidadeIndex = -1;

    // 1. Busca dinâmica nas primeiras 25 linhas por qualquer célula contendo "unidade", "apto", "apartamento", etc.
    for (let i = 0; i < Math.min(25, rawData.length); i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      const colIndex = row.findIndex(cell => {
        if (cell === null || cell === undefined) return false;
        const str = String(cell).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        return (
          str.includes('unidade') ||
          str === 'apto' ||
          str === 'apartamento' ||
          str === 'unid' ||
          str === 'ap' ||
          str === 'numero' ||
          str === 'identificador' ||
          str === 'unidade *' ||
          str === 'unidade*'
        );
      });

      if (colIndex !== -1) {
        headerIndex = i;
        columnUnidadeIndex = colIndex;
        break;
      }
    }

    let unidadesExtraidas = [];

    if (headerIndex !== -1 && columnUnidadeIndex !== -1) {
      // Extrai apenas as linhas abaixo do cabeçalho detectado
      for (let i = headerIndex + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;
        const cellVal = row[columnUnidadeIndex];
        if (cellVal !== undefined && cellVal !== null) {
          const nomeUnidade = String(cellVal).trim();
          if (nomeUnidade !== '' && !nomeUnidade.toLowerCase().includes('total') && !nomeUnidade.toLowerCase().includes('legenda')) {
            unidadesExtraidas.push(nomeUnidade);
          }
        }
      }
    }

    // 2. Fallback de varredura por padrões se não encontrou cabeçalho explícito
    if (unidadesExtraidas.length === 0) {
      rawData.forEach((row, rIdx) => {
        if (rIdx < 2 && rawData.length > 5) return;
        if (Array.isArray(row)) {
          row.forEach(cell => {
            if (cell === null || cell === undefined) return;
            const val = String(cell).trim();
            if (!val) return;
            if (/^[A-Za-z0-9]+[-/][A-Za-z0-9]+$/.test(val) || /^([A-Za-z]+\s*)?\d{2,4}$/i.test(val)) {
              unidadesExtraidas.push(val);
            }
          });
        }
      });
    }

    // Remove duplicatas preservando a ordem original estrita de inserção
    const unidadesUnicas = Array.from(new Set(unidadesExtraidas.map(u => String(u).trim()).filter(Boolean)));

    if (unidadesUnicas.length === 0) {
      throw new Error('Não foi possível encontrar a coluna de Unidades na planilha.');
    }

    return unidadesUnicas;
  },

  /**
   * Salva a lista de unidades no LocalStorage e Filesystem local (Offline-First).
   * A sincronização com o Supabase é feita em background pelo syncOfflineService
   * quando a conexão for restabelecida — sem bloquear o fluxo de importação.
   */
  async persistirUnidadesLocal(condominioId, unidades) {
    if (!condominioId || !Array.isArray(unidades)) return;

    // 1. LocalStorage — unidades disponíveis imediatamente
    const storageKey = `unidades_${condominioId}`;
    localStorage.setItem(storageKey, JSON.stringify(unidades));

    // 2. Filesystem — persistência permanente
    const fileName = `unidades_${condominioId}.json`;
    await salvarArquivoSeguro(fileName, JSON.stringify(unidades));

    // 3. INICIALIZAR LEITURAS ANTERIORES ZERADAS
    const leiturasZeradas = unidades.map(nome => ({
      unidade: String(nome).trim(),
      leitura_anterior: 0,
      leitura_anterior_gas: 0
    }));
    localStorage.setItem(`leituras_anteriores_${condominioId}`, JSON.stringify(leiturasZeradas));

    // 4. Supabase — tentativa em background
    if (supabase) {
      try {
        const unidadesParaInserir = unidades.map(nome => ({
          condominio_id: condominioId,
          nome: String(nome).trim(),
          numero: String(nome).trim(),
          identificador: String(nome).trim(),
          status: 'pendente',
        }));
        // Fire-and-forget
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

      // 2. Extrai unidades no formato uCondo
      let unidades = [];
      try {
        unidades = this.extrairUnidades(fileData);
      } catch (_) {
        unidades = [];
      }

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

          // Atualiza as unidades locais zerando as leituras
          await this.persistirUnidadesLocal(condExistente.id, unidades);

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

          // Insere todas as unidades extraídas com o ID gerado (e zera o histórico de leituras)
          await this.persistirUnidadesLocal(condominioSalvo.id, unidades);

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

