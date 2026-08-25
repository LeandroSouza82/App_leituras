import * as XLSX from 'xlsx';
import { salvarArquivoSeguro } from './filesystemService';
import { salvarCondominio } from './condominioService';
import { supabase } from './supabase';
import { customPrompt } from '../components/CustomPrompt/CustomPrompt';

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
   * Salva a lista de unidades no Filesystem local, LocalStorage e no Supabase (Batch Insert)
   */
  async persistirUnidadesLocal(condominioId, unidades) {
    if (!condominioId || !Array.isArray(unidades)) return;

    // 1. LocalStorage
    const storageKey = `unidades_${condominioId}`;
    localStorage.setItem(storageKey, JSON.stringify(unidades));

    // 2. Filesystem (Permanente)
    const fileName = `unidades_${condominioId}.json`;
    await salvarArquivoSeguro(fileName, JSON.stringify(unidades));

    // 3. Supabase (Persistência em Nuvem com Batch Insert)
    if (supabase) {
      try {
        // Remove unidades antigas vinculadas a este condomínio
        await supabase.from('unidades').delete().eq('condominio_id', condominioId);

        // Prepara lote com as colunas nome, numero, identificador e status
        const unidadesParaInserir = unidades.map(nome => ({
          condominio_id: condominioId,
          nome: String(nome).trim(),
          numero: String(nome).trim(),
          identificador: String(nome).trim(),
          status: 'pendente',
        }));

        const { error: insertError } = await supabase.from('unidades').insert(unidadesParaInserir);
        if (insertError) {
        }
      } catch (err) {
      }
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

      // ==========================================
      // BIFURCAÇÃO INTELIGENTE (FORK)
      // ==========================================
      let isPlanilhaLeituras = false;

      if (rawData && rawData.length > 0) {
        const cabecalhoEmTexto = rawData.slice(0, 15).map(row => (row || []).join(' ').toLowerCase()).join(' ');
        
        if ((cabecalhoEmTexto.includes('condomínio') || cabecalhoEmTexto.includes('condominio')) && cabecalhoEmTexto.includes('consumo de')) {
          // Verifica se o condomínio já existe antes de forçar o fluxo de leituras anteriores
          const metadadosTemp = this.extrairMetadadosPlanilha(rawData, nomeArquivo);
          const nomeSugeridoTemp = metadadosTemp.nome || this.extrairNomeCondominioDeArquivo(nomeArquivo);
          const nomeLimpoTemp = normalizarNome(nomeSugeridoTemp);
          
          // Faz a busca flexível e já guarda o objeto inteiro (com ID) na variável
          const condExistente = condominiosExistentes.find(c => {
            const nomeBanco = normalizarNome(c.nome);
            if (!nomeBanco || !nomeLimpoTemp) return false;
            if (nomeBanco === nomeLimpoTemp || nomeBanco.includes(nomeLimpoTemp) || nomeLimpoTemp.includes(nomeBanco)) return true;
            const distancia = calcularDistanciaLevenstein(nomeBanco, nomeLimpoTemp);
            return (nomeLimpoTemp.length > 8 && distancia <= 2);
          });

          const existeNoBanco = !!condExistente;          
          if (existeNoBanco) {
            isPlanilhaLeituras = true;
          }
        }
      }

      if (isPlanilhaLeituras) {
        return await this.processarPlanilhaLeiturasAnteriores(nomeArquivo, rawData, condominiosExistentes);
      }

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
        if (supabase && nomeLimpoPlanilha) {
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

        // 2.3 Fallback de checagem na lista em memória (condominiosExistentes) com matching parcial
        if (!condExistente && Array.isArray(condominiosExistentes) && nomeLimpoPlanilha) {
          condExistente = condominiosExistentes.find(c => {
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
          const querSubstituir = window.confirm(
            `O condomínio '${condExistente.nome}' já existe. Deseja atualizar a planilha deste condomínio?`
          );

          if (!querSubstituir) {
            return { cancelado: true }; // Aborta se o usuário cancelar
          }

          // LÓGICA DE ATUALIZAÇÃO:
          // 1. Deleta as unidades antigas e insere as novas usando o MESMO condominioExistente.id
          await this.persistirUnidadesLocal(condExistente.id, unidades);

          // 2. Atualiza APENAS a contagem de apartamentos no condomínio existente. 
          // O campo tipo_leitura do card no banco de dados é intocável durante o processo de importação.
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

          const condominioSalvo = await salvarCondominio(novoCondominioData);

          if (!condominioSalvo || !condominioSalvo.id) {
            throw new Error('Não foi possível salvar o novo condomínio no Supabase.');
          }

          // Insere todas as unidades extraídas com o ID gerado
          await this.persistirUnidadesLocal(condominioSalvo.id, unidades);

          // ==========================================
          // MÁGICA ALL-IN-ONE: SE A PLANILHA TIVER LEITURAS, JÁ SALVA JUNTO!
          // ==========================================
          try {
            let headerRowIdx = -1;
            let unidColIdx = -1;
            let consumoColIdx = -1;
            let leituraAntColIdx = -1;
            let servicoPlanilha = 'AGUA';

            for (let i = 0; i < Math.min(10, rawData.length); i++) {
              const row = rawData[i];
              if (!row || !Array.isArray(row)) continue;
              for (let j = 0; j < row.length; j++) {
                const cellText = String(row[j] || '').trim().toLowerCase();
                
                if (cellText.includes('gás') || cellText.includes('gas') || cellText.includes('m3')) {
                  servicoPlanilha = 'GAS';
                } else if (cellText.includes('energia') || cellText.includes('luz') || cellText.includes('elétrica') || cellText.includes('eletrica') || cellText.includes('kwh')) {
                  servicoPlanilha = 'ENERGIA';
                }

                if (cellText === 'unidade' || cellText === 'unid' || cellText.includes('unidade')) {
                  if (headerRowIdx === -1 || headerRowIdx === i) {
                    headerRowIdx = i;
                    unidColIdx = j;
                  }
                }
                if (cellText.includes('consumo')) {
                  if (headerRowIdx === -1 || headerRowIdx === i) {
                    headerRowIdx = i;
                    consumoColIdx = j;
                  }
                }
              }
            }

            if (headerRowIdx !== -1 && unidColIdx !== -1 && consumoColIdx !== -1) {
              leituraAntColIdx = consumoColIdx > 0 ? consumoColIdx - 1 : 3;
            } else {
              leituraAntColIdx = 3;
              unidColIdx = 1;
              headerRowIdx = 5;
            }

            const leiturasExtraidas = [];
            for (let i = headerRowIdx + 1; i < rawData.length; i++) {
              const row = rawData[i];
              if (!row || !Array.isArray(row) || row.length === 0) continue;
              const unidade = String(row[unidColIdx] || '').trim();
              const leituraAnteriorStr = String(row[leituraAntColIdx] || '').trim();

              if (unidade && !unidade.toLowerCase().includes('total') && leituraAnteriorStr) {
                const leituraAnteriorNum = parseFloat(leituraAnteriorStr.replace(/\./g, '').replace(',', '.'));
                if (!isNaN(leituraAnteriorNum)) {
                  leiturasExtraidas.push({
                    unidade,
                    leitura_anterior: leituraAnteriorNum
                  });
                }
              }
            }

            if (leiturasExtraidas.length > 0) {
              localStorage.setItem(`leituras_anteriores_${condominioSalvo.id}_${servicoPlanilha}`, JSON.stringify(leiturasExtraidas));
              await this.sincronizarLeiturasAnterioresEmLote(condominioSalvo.id, leiturasExtraidas, servicoPlanilha);
            }
          } catch (errLeituras) {
            console.error("Erro ao incluir leituras automáticas no cadastro:", errLeituras);
          }
          // ==========================================

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
   * FRENTE 3 (FORK): Processamento Dedicado para Planilha de Leituras Anteriores
   */
  async processarPlanilhaLeiturasAnteriores(nomeArquivo, rawData, condominiosExistentes) {
    try {
      const metadados = this.extrairMetadadosPlanilha(rawData, nomeArquivo);
      let nomeExtraido = metadados.nome;

      if (!nomeExtraido) {
        nomeExtraido = this.extrairNomeCondominioDeArquivo(nomeArquivo);
      }
      
      const nomeLimpoPlanilha = normalizarNome(nomeExtraido);
      let condExistente = null;

      // Busca flexível no Supabase (Fonte da Verdade)
      if (supabase && nomeLimpoPlanilha) {
        try {
          const { data: todosConds, error: fetchError } = await supabase
            .from('condominios')
            .select('*');

          if (!fetchError && Array.isArray(todosConds)) {
            condExistente = todosConds.find(c => {
              const nomeBanco = normalizarNome(c.nome);
              if (!nomeBanco || !nomeLimpoPlanilha) return false;
              
              if (nomeBanco === nomeLimpoPlanilha || nomeBanco.includes(nomeLimpoPlanilha) || nomeLimpoPlanilha.includes(nomeBanco)) return true;
              
              const distancia = calcularDistanciaLevenstein(nomeBanco, nomeLimpoPlanilha);
              if (nomeLimpoPlanilha.length > 8 && distancia <= 2) return true;
              
              return false;
            }) || null;
          }
        } catch (errDb) {}
      }

      // Fallback em memória
      if (!condExistente && Array.isArray(condominiosExistentes) && nomeLimpoPlanilha) {
        condExistente = condominiosExistentes.find(c => {
          const nomeBanco = normalizarNome(c.nome);
          if (!nomeBanco || !nomeLimpoPlanilha) return false;
          if (nomeBanco === nomeLimpoPlanilha || nomeBanco.includes(nomeLimpoPlanilha) || nomeLimpoPlanilha.includes(nomeBanco)) return true;
          const distancia = calcularDistanciaLevenstein(nomeBanco, nomeLimpoPlanilha);
          if (nomeLimpoPlanilha.length > 8 && distancia <= 2) return true;
          return false;
        }) || null;
      }

      if (!condExistente) {
        throw new Error(`Condomínio vinculado à planilha "${nomeExtraido}" não foi encontrado. Cadastre o condomínio primeiro.`);
      }

      // 1. Identificação Dinâmica (A Inteligência)
      let mesReferencia = '';
      let headerRowIndex = -1;
      let unidadeColIndex = -1;
      let consumoColIndex = -1;
      let leituraAnteriorColIndex = -1;
      let servicoPlanilha = 'AGUA';

      // Varrer primeiras 10 linhas
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;

        for (let j = 0; j < row.length; j++) {
          const cellText = String(row[j] || '').trim().toLowerCase();

          if (cellText.includes('gás') || cellText.includes('gas') || cellText.includes('m3')) {
            servicoPlanilha = 'GAS';
          } else if (cellText.includes('energia') || cellText.includes('luz') || cellText.includes('elétrica') || cellText.includes('eletrica') || cellText.includes('kwh')) {
            servicoPlanilha = 'ENERGIA';
          }
          
          if (cellText.includes('referência') || cellText.includes('referencia')) {
            const parts = String(row[j]).split(/refer[êe]ncia/i);
            if (parts.length > 1 && parts[1].trim() !== '') {
              mesReferencia = parts[1].trim();
            } else if (j + 1 < row.length) {
              mesReferencia = String(row[j + 1] || '').trim();
            }
          }

          if (cellText === 'unidade' || cellText === 'unid' || cellText === 'ap' || cellText.includes('unidade')) {
            if (headerRowIndex === -1 || headerRowIndex === i) {
              headerRowIndex = i;
              unidadeColIndex = j;
            }
          }

          if (cellText.includes('consumo')) {
            if (headerRowIndex === -1 || headerRowIndex === i) {
              headerRowIndex = i;
              consumoColIndex = j;
            }
          }
        }
      }

      // Captura Exata
      if (headerRowIndex !== -1 && unidadeColIndex !== -1 && consumoColIndex !== -1) {
        if (consumoColIndex > 0) {
          leituraAnteriorColIndex = consumoColIndex - 1;
        }

        if (mesReferencia) {
          const row = rawData[headerRowIndex];
          const mesRefLimpo = mesReferencia.toLowerCase().split(' ')[0]; // ex: "julho"
          for (let j = 0; j < row.length; j++) {
            const headText = String(row[j] || '').trim().toLowerCase();
            if (headText.includes(mesRefLimpo)) {
              leituraAnteriorColIndex = j;
              break;
            }
          }
        }
      }

      // Fallback
      if (leituraAnteriorColIndex === -1) leituraAnteriorColIndex = 3;
      if (unidadeColIndex === -1) unidadeColIndex = 1;
      if (headerRowIndex === -1) headerRowIndex = 5;

      const nomeRefExibicao = mesReferencia || 'Anterior';
      const labelServico = servicoPlanilha === 'GAS' ? 'Gás' : servicoPlanilha === 'ENERGIA' ? 'Energia' : 'Água';
      const desejaSalvar = window.confirm(`Planilha de fechamento de ${labelServico} de ${nomeRefExibicao} identificada. Deseja salvar estas leituras como base (Leitura Anterior) para a nova coleta?`);

      if (!desejaSalvar) {
        return { cancelado: true };
      }

      const leiturasExtraidas = [];
      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;
        
        const unidade = String(row[unidadeColIndex] || '').trim();
        const leituraAnteriorStr = String(row[leituraAnteriorColIndex] || '').trim();
        
        if (unidade && !unidade.toLowerCase().includes('total') && leituraAnteriorStr) {
          const leituraAnteriorNum = parseFloat(leituraAnteriorStr.replace(/\./g, '').replace(',', '.'));
          if (!isNaN(leituraAnteriorNum)) {
            leiturasExtraidas.push({
              unidade,
              leitura_anterior: leituraAnteriorNum
            });
          }
        }
      }

      if (leiturasExtraidas.length === 0) {
         throw new Error('Nenhuma leitura anterior válida foi encontrada na planilha.');
      }

      try {
        localStorage.setItem(`leituras_anteriores_${condExistente.id}_${servicoPlanilha}`, JSON.stringify(leiturasExtraidas));
      } catch (e) {}

      // Envio em lote
      await this.sincronizarLeiturasAnterioresEmLote(condExistente.id, leiturasExtraidas, servicoPlanilha);

      return {
        tipo: 'atualizado', // Reutilizando a prop 'atualizado' para o Toast no App.jsx funcionar perfeitamente
        condominio: condExistente,
        totalUnidades: leiturasExtraidas.length
      };

    } catch (error) {
      throw error;
    }
  },

  /**
   * Função assíncrona que pega o array extraído e faz o envio em massa (lote) 
   * para a tabela no banco de dados, vinculando cada leitura à sua unidade.
   */
  async sincronizarLeiturasAnterioresEmLote(condominioId, leiturasArray, servicoPlanilha = 'AGUA') {
    if (!supabase) throw new Error('Supabase não configurado.');

    try {
      // 0. Captura o usuário ativo para garantir o vínculo multi-tenant (RLS)
      let activeUserId = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) activeUserId = user.id;
      } catch { /* Mantém null como fallback seguro */ }

      // 1. Busca as unidades do condomínio para obter os IDs (vinculação relacional)
      const { data: unidadesBanco, error: errUnidades } = await supabase
        .from('unidades')
        .select('id, nome, condominio_id')
        .eq('condominio_id', condominioId);

      if (errUnidades) throw new Error('Não foi possível carregar os dados das unidades do servidor.');
      
      if (!unidadesBanco || unidadesBanco.length === 0) {
        throw new Error('Nenhuma unidade cadastrada encontrada para este condomínio. Cadastre as unidades primeiro.');
      }

      // 2. Prepara o lote de atualização
      const loteParaEnvio = [];

      for (const item of leiturasArray) {
        // Encontra a unidade correspondente pelo nome normalizado
        const unidadeBanco = unidadesBanco.find(u => normalizarNome(u.nome) === normalizarNome(item.unidade));
        
        if (unidadeBanco) {
          loteParaEnvio.push({
            unidade: unidadeBanco.nome,
            condominio_nome: unidadeBanco.condominio_id, // Usando ID temporariamente para manter relação
            leitura_anterior: item.leitura_anterior,
            leiturista_id: activeUserId,
            servico: servicoPlanilha,
          });
        }
      }

      if (loteParaEnvio.length > 0) {
        // Correção 1: Apontando para a tabela correta que criamos (unidades_leituras)
        // Correção 2: Removendo o upsert complexo para um insert simples inicial
        const { error } = await supabase.from('unidades_leituras').insert(loteParaEnvio);
        
        if (error) {
          console.error("Erro do Supabase:", error);
          throw new Error('Houve uma falha de comunicação com o servidor ao salvar as leituras. Verifique sua conexão e tente novamente.');
        }
      }
    } catch(err) {
      // Correção 3: Mensagem amigável capturando o erro tratado
      throw new Error(err.message || 'Ocorreu um erro inesperado ao salvar as leituras da planilha.');
    }
  },

  /**
   * FRENTE 2: Criação Automática de Novo Condomínio + Unidades em Massa
   */
  async criarCondominioComPlanilha(nomeArquivo, fileData, showToast = alert) {
    try {
      // 1. Extração das unidades
      const unidades = this.extrairUnidades(fileData);

      // 2. Extração do Nome Automático
      let nomeSugerido = this.extrairNomeCondominioDeArquivo(nomeArquivo);
      let nomeFinal = await customPrompt(
        'Confirme ou digite o nome deste novo condomínio:', 
        nomeSugerido || 'Novo Condomínio'
      );

      if (!nomeFinal || !nomeFinal.trim()) {
        return null;
      }
      nomeFinal = nomeFinal.trim();

      // 3. Criação do Card Pai (Condomínio)
      const novoCondominioData = {
        nome: nomeFinal,
        tipoLeitura: 'Água e Gás',
        diaLeitura: '10',
        apartamentos: unidades.length,
        valor: 0,
        endereco: '',
        instrucoesAcesso: '',
        contatoSindico: '',
      };

      const condominioSalvo = await salvarCondominio(novoCondominioData);

      if (!condominioSalvo || !condominioSalvo.id) {
        throw new Error('Não foi possível criar o condomínio no banco de dados.');
      }

      // 4. Criação dos Cards Filhos (Unidades)
      await this.persistirUnidadesLocal(condominioSalvo.id, unidades);

      return {
        condominio: condominioSalvo,
        totalUnidades: unidades.length,
      };
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

      let isPlanilhaLeituras = false;
      let rawDataToExtractLeituras = null;

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
        rawDataToExtractLeituras = rawData;
        
        if (rawData && rawData.length > 0) {
          // Varre as primeiras 15 linhas inteiras procurando as palavras-chave em qualquer coluna
          const cabecalhoEmTexto = rawData.slice(0, 15).map(row => (row || []).join(' ').toLowerCase()).join(' ');
          
          if ((cabecalhoEmTexto.includes('condomínio') || cabecalhoEmTexto.includes('condominio')) && cabecalhoEmTexto.includes('consumo de')) {
            isPlanilhaLeituras = true;
          }
        }

        const metadados = this.extrairMetadadosPlanilha(rawData, '');

        if (metadados.nome && condominoAtualNome) {
          const nomePlanilhaNorm = normalizarNome(metadados.nome);
          const nomeAtualNorm = normalizarNome(condominoAtualNome);

          const temCorrespondencia = nomePlanilhaNorm.includes(nomeAtualNorm) || nomeAtualNorm.includes(nomePlanilhaNorm);

          if (!temCorrespondencia) {
            const confirmarDivergencia = window.confirm(
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
        const confirmar = window.confirm(
          `Este condomínio já possui ${unidadesAtuais.length} unidades cadastradas.\n\nDeseja substituir a lista atual pelas ${novasUnidades.length} unidades da nova planilha?`
        );
        if (!confirmar) {
          return null;
        }
      }

      await this.persistirUnidadesLocal(condominioId, novasUnidades);

      // 3. Se for planilha de leituras, extrai as leituras anteriores e envia em lote para o Supabase
      if (isPlanilhaLeituras && rawDataToExtractLeituras) {
        // 1. Identificação Dinâmica (A Inteligência)
        let mesReferencia = '';
        let headerRowIndex = -1;
        let unidadeColIndex = -1;
        let consumoColIndex = -1;
        let leituraAnteriorColIndex = -1;

        // Varrer primeiras 10 linhas
        for (let i = 0; i < Math.min(10, rawDataToExtractLeituras.length); i++) {
          const row = rawDataToExtractLeituras[i];
          if (!row || !Array.isArray(row)) continue;

          for (let j = 0; j < row.length; j++) {
            const cellText = String(row[j] || '').trim().toLowerCase();
            
            if (cellText.includes('referência') || cellText.includes('referencia')) {
              const parts = String(row[j]).split(/refer[êe]ncia/i);
              if (parts.length > 1 && parts[1].trim() !== '') {
                mesReferencia = parts[1].trim();
              } else if (j + 1 < row.length) {
                mesReferencia = String(row[j + 1] || '').trim();
              }
            }

            if (cellText === 'unidade' || cellText === 'unid' || cellText === 'ap' || cellText.includes('unidade')) {
              if (headerRowIndex === -1 || headerRowIndex === i) {
                headerRowIndex = i;
                unidadeColIndex = j;
              }
            }

            if (cellText.includes('consumo')) {
              if (headerRowIndex === -1 || headerRowIndex === i) {
                headerRowIndex = i;
                consumoColIndex = j;
              }
            }
          }
        }

        // Captura Exata
        if (headerRowIndex !== -1 && unidadeColIndex !== -1 && consumoColIndex !== -1) {
          if (consumoColIndex > 0) {
            leituraAnteriorColIndex = consumoColIndex - 1;
          }

          if (mesReferencia) {
            const row = rawDataToExtractLeituras[headerRowIndex];
            const mesRefLimpo = mesReferencia.toLowerCase().split(' ')[0]; // ex: "julho"
            for (let j = 0; j < row.length; j++) {
              const headText = String(row[j] || '').trim().toLowerCase();
              if (headText.includes(mesRefLimpo)) {
                leituraAnteriorColIndex = j;
                break;
              }
            }
          }
        }

        // Fallback
        if (leituraAnteriorColIndex === -1) leituraAnteriorColIndex = 3;
        if (unidadeColIndex === -1) unidadeColIndex = 1;
        if (headerRowIndex === -1) headerRowIndex = 5;

        const nomeRefExibicao = mesReferencia || 'Anterior';
        const desejaSalvar = window.confirm(`Planilha de fechamento de ${nomeRefExibicao} identificada. Deseja salvar estas leituras como base (Leitura Anterior) para a nova coleta?`);

        if (desejaSalvar) {
          const leiturasExtraidas = [];
          for (let i = headerRowIndex + 1; i < rawDataToExtractLeituras.length; i++) {
            const row = rawDataToExtractLeituras[i];
            if (!row || !Array.isArray(row) || row.length === 0) continue;
            
            const unidade = String(row[unidadeColIndex] || '').trim();
            const leituraAnteriorStr = String(row[leituraAnteriorColIndex] || '').trim();
            
            if (unidade && !unidade.toLowerCase().includes('total') && leituraAnteriorStr) {
              const leituraAnteriorNum = parseFloat(leituraAnteriorStr.replace(/\./g, '').replace(',', '.'));
              if (!isNaN(leituraAnteriorNum)) {
                leiturasExtraidas.push({
                  unidade,
                  leitura_anterior: leituraAnteriorNum
                });
              }
            }
          }

          if (leiturasExtraidas.length > 0) {
            try {
              localStorage.setItem(`leituras_anteriores_${condominioId}`, JSON.stringify(leiturasExtraidas));
            } catch (e) {}

            await this.sincronizarLeiturasAnterioresEmLote(condominioId, leiturasExtraidas);
          }
        }
      }

      return novasUnidades;
    } catch (error) {
      throw error;
    }
  }
};

export default UCondoImportService;

