import * as XLSX from 'xlsx';
import { salvarArquivoSeguro } from './filesystemService';
import { salvarCondominio } from './condominioService';
import { supabase } from './supabase';

/**
 * Normaliza o nome do condomínio removendo acentos, múltiplos espaços,
 * caracteres invisíveis e convertendo para minúsculas para comparação 100% precisa.
 */
export const normalizarNome = (nome) => {
  if (!nome) return '';
  return String(nome)
    .trim()
    .toLowerCase()
    .normalize('NFD') // Separa os acentos das letras
    .replace(/[\u0300-\u036f]/g, '') // Remove os acentos
    .replace(/\s+/g, ' '); // Transforma múltiplos espaços em um só
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

    // Remove prefixos comuns do uCondo / exportações
    limpo = limpo.replace(/^(ucondo|u_condo|consumos|consumo|planilha|leituras|leitura)[_\-\s]*/i, '');

    // Remove sufixos de serviços / datas comuns
    limpo = limpo.replace(/[_\-\s]*(agua|gas|energia|geral|consumos|consumo|\d{4}[_\-]?\d{2}[_\-]?\d{2}|\d{6,14})$/i, '');

    // Substitui underscores e hífens repetidos por espaços
    limpo = limpo.replace(/[_\-]+/g, ' ').trim();

    return limpo || '';
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
      console.error('[UCondoImport] Falha na leitura inicial com SheetJS, tentando fallback binary:', readErr);
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
          console.warn('[UCondoImportService] Aviso na inserção em lote no Supabase:', insertError);
        }
      } catch (err) {
        console.warn('[UCondoImportService] Erro ao sincronizar unidades com Supabase:', err);
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
              if (tipoStr.toLowerCase().includes('agua') && tipoStr.toLowerCase().includes('gas')) {
                tipoMedicaoExtraido = 'Água e Gás';
              } else if (tipoStr.toLowerCase().includes('agua')) {
                tipoMedicaoExtraido = 'Somente Água';
              } else if (tipoStr.toLowerCase().includes('gas') || tipoStr.toLowerCase().includes('gás')) {
                tipoMedicaoExtraido = 'Somente Gás';
              } else if (tipoStr.toLowerCase().includes('energia')) {
                tipoMedicaoExtraido = 'Energia Elétrica';
              } else if (tipoStr) {
                tipoMedicaoExtraido = tipoStr;
              }
            }
          }
        }
      }
    }

    // Fallback: se não achou nas células, tenta extrair do nome do arquivo
    if (!nomeExtraido && nomeArquivo) {
      nomeExtraido = this.extrairNomeCondominioDeArquivo(nomeArquivo);
    }

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
        let tipoMedicaoExtraido = metadados.tipoMedicao || 'Água e Gás';

        if (!nomeExtraido) {
          // Fallback se a planilha estiver diferente: pede pro usuário digitar
          nomeExtraido = window.prompt('Não foi possível ler o nome na planilha. Digite o nome do condomínio:');
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
                return (
                  nomeBanco === nomeLimpoPlanilha ||
                  nomeBanco.includes(nomeLimpoPlanilha) ||
                  nomeLimpoPlanilha.includes(nomeBanco)
                );
              }) || null;
            }
          } catch (errDb) {
            console.warn('[UCondoImportService] Aviso na busca no Supabase:', errDb);
          }
        }

        // 2.3 Fallback de checagem na lista em memória (condominiosExistentes) com matching parcial
        if (!condExistente && Array.isArray(condominiosExistentes) && nomeLimpoPlanilha) {
          condExistente = condominiosExistentes.find(c => {
            const nomeBanco = normalizarNome(c.nome);
            if (!nomeBanco || !nomeLimpoPlanilha) return false;
            return (
              nomeBanco === nomeLimpoPlanilha ||
              nomeBanco.includes(nomeLimpoPlanilha) ||
              nomeLimpoPlanilha.includes(nomeBanco)
            );
          }) || null;
        }

        // 2.4 Se o condomínio já existe: Pergunta se deseja substituir
        if (condExistente) {
          const querSubstituir = window.confirm(
            `Encontramos o condomínio "${condExistente.nome}". Deseja atualizar a lista de apartamentos usando esta planilha?`
          );

          if (!querSubstituir) {
            return { cancelado: true }; // Aborta se o usuário cancelar
          }

          // LÓGICA DE ATUALIZAÇÃO:
          // 1. Deleta as unidades antigas e insere as novas usando o MESMO condominioExistente.id
          await this.persistirUnidadesLocal(condExistente.id, unidades);

          // 2. Atualiza a contagem de apartamentos e tipo no condomínio existente
          if (supabase) {
            try {
              await supabase
                .from('condominios')
                .update({ 
                  apartamentos: unidades.length,
                  tipo_leitura: tipoMedicaoExtraido || condExistente.tipo_leitura
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
            tipoLeitura: tipoMedicaoExtraido,
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
      console.error('[UCondoImportService] Erro no processamento:', error);
      throw error;
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
      let nomeFinal = window.prompt('Confirme ou digite o nome deste novo condomínio:', nomeSugerido || 'Novo Condomínio');

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
      console.error('[UCondoImportService] Erro ao criar condomínio a partir de planilha:', error);
      throw error;
    }
  },

  /**
   * FRENTE 1: Atualização / Substituição de Unidades de Condomínio Existente
   */
  async atualizarUnidadesCondominio(condominioId, fileData, unidadesAtuais = []) {
    try {
      const novasUnidades = this.extrairUnidades(fileData);

      if (unidadesAtuais && unidadesAtuais.length > 0) {
        const confirmar = window.confirm(
          `Este condomínio já possui ${unidadesAtuais.length} unidades cadastradas.\n\nDeseja substituir a lista atual pelas ${novasUnidades.length} unidades da nova planilha?`
        );
        if (!confirmar) {
          return null;
        }
      }

      await this.persistirUnidadesLocal(condominioId, novasUnidades);
      return novasUnidades;
    } catch (error) {
      console.error('[UCondoImportService] Erro ao atualizar unidades:', error);
      throw error;
    }
  }
};

export default UCondoImportService;

