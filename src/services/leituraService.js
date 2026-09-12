import { customAlert, customConfirm } from '../components/CustomPrompt/CustomPrompt';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StorageService } from './storageService.js';
import { supabase } from './supabase.js';
import * as XLSX from 'xlsx';
import { parseLeituraNumerica } from '../utils/leituraNumerica.js';
import { obterLeituraAnterior } from './leiturasAnterioresService.js';

/**
 * leituraService - Módulo modular para gerenciamento e exportação de leituras no padrão uCondo.
 */
export const LeituraService = {
  /**
   * Converte e formata o valor bruto para o formato numérico/decimal esperado pelo Excel do uCondo
   */
  formatarValorLeitura(valor) {
    const num = parseLeituraNumerica(valor);
    if (num === null) return "";
    return num.toFixed(4);
  },

  /**
   * Cruzamento de Dados (Join): Busca a leitura salva para uma unidade específica
   * em todas as camadas de persistência (Memória > LocalStorage > Fila Offline > Filesystem).
   */
  obterValorLeitura(condominioId, unidade, servico, valoresMemoria = {}) {
    const servicoKey = String(servico || '').trim().toLowerCase();
    const unidadeStr = String(unidade || '').trim();
    const condIdStr = String(condominioId || '').trim();

    // 1. Busca no Objeto de Memória (leiturasValores do componente)
    if (valoresMemoria && typeof valoresMemoria === 'object') {
      // 1.0 Chaves planas (gravadas por handleSaveReading: "APTO-101_agua")
      const chavePlanaLower = `${unidadeStr}_${servicoKey}`;
      if (valoresMemoria[chavePlanaLower] !== undefined && valoresMemoria[chavePlanaLower] !== null && String(valoresMemoria[chavePlanaLower]).trim() !== '') {
        return valoresMemoria[chavePlanaLower];
      }
      const chavePlanaUpper = `${unidadeStr}_${servicoKey.toUpperCase()}`;
      if (valoresMemoria[chavePlanaUpper] !== undefined && valoresMemoria[chavePlanaUpper] !== null && String(valoresMemoria[chavePlanaUpper]).trim() !== '') {
        return valoresMemoria[chavePlanaUpper];
      }

      // 1.1 Acesso direto aninhado
      if (valoresMemoria[unidadeStr]?.[servicoKey] !== undefined) {
        return valoresMemoria[unidadeStr][servicoKey];
      }
      if (valoresMemoria[unidadeStr]?.[servicoKey.toUpperCase()] !== undefined) {
        return valoresMemoria[unidadeStr][servicoKey.toUpperCase()];
      }
      // 1.2 Acesso com normalização de case e espaços
      for (const [uKey, uVal] of Object.entries(valoresMemoria)) {
        if (String(uKey).trim().toLowerCase() === unidadeStr.toLowerCase()) {
          if (uVal && typeof uVal === 'object') {
            for (const [sKey, sVal] of Object.entries(uVal)) {
              if (String(sKey).trim().toLowerCase() === servicoKey) {
                if (sVal !== null && sVal !== undefined && String(sVal).trim() !== '') {
                  return sVal;
                }
              }
            }
          } else if (typeof uVal === 'string' || typeof uVal === 'number') {
            return uVal;
          }
        }
      }
    }

    // 2. Busca no LocalStorage por chaves específicas DO CONDOMÍNIO
    const chavesPossiveis = [
      `valor_${condIdStr}_${unidadeStr}_${servicoKey}`,
      `valor_${condIdStr}_${unidadeStr}_${servicoKey.toUpperCase()}`,
      `valor_${condIdStr}_${unidadeStr}_${servico}`,
    ];

    for (const ch of chavesPossiveis) {
      const val = localStorage.getItem(ch);
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        return val;
      }
    }

    // 3. Varredura flexível no LocalStorage ESTRITAMENTE DENTRO DO CONDOMÍNIO
    if (condIdStr) {
      try {
        const prefix = `valor_${condIdStr}_`.toLowerCase();
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.toLowerCase().startsWith(prefix)) {
            const keyLower = key.toLowerCase();
            const uniLower = unidadeStr.toLowerCase();
            const srvLower = servicoKey.toLowerCase();

            if (keyLower.includes(uniLower) && keyLower.includes(srvLower)) {
              const val = localStorage.getItem(key);
              if (val !== null && val !== undefined && String(val).trim() !== '') {
                return val;
              }
            }
          }
        }
      } catch (_) {}
    }

    // 4. Busca na fila de sincronização offline ESTRITAMENTE DENTRO DO CONDOMÍNIO
    try {
      const fila = JSON.parse(localStorage.getItem('fila_sync_auto') || '[]');
      if (Array.isArray(fila)) {
        const item = fila.find(
          f =>
            String(f.condominio_id || f.condominioId || '').trim() === condIdStr &&
            String(f.unidade_id || f.unidadeId || '').trim().toLowerCase() === unidadeStr.toLowerCase() &&
            String(f.servico || f.tipoServico || '').trim().toLowerCase() === servicoKey
        );
        if (item?.leitura_atual !== undefined && item?.leitura_atual !== null && String(item.leitura_atual).trim() !== '') {
          return item.leitura_atual;
        }
      }
    } catch (_) {}

    // 5. Busca na fila de pendências offline ESTRITAMENTE DENTRO DO CONDOMÍNIO
    try {
      const pendencias = JSON.parse(
        localStorage.getItem('leituras_pendentes') || localStorage.getItem('pendencias_offline') || '[]'
      );
      if (Array.isArray(pendencias)) {
        const item = pendencias.find(
          f =>
            String(f.condominio_id || f.condominioId || '').trim() === condIdStr &&
            String(f.unidade_id || f.unidadeId || '').trim().toLowerCase() === unidadeStr.toLowerCase() &&
            String(f.servico || f.tipoServico || '').trim().toLowerCase() === servicoKey
        );
        if (item?.leitura_atual !== undefined && item?.leitura_atual !== null && String(item.leitura_atual).trim() !== '') {
          return item.leitura_atual;
        }
      }
    } catch (_) {}

    // Dado ausente: retorna null (não inventa zero para leitura não preenchida)
    return null;
  },

  /**
   * Obtém a lista de unidades do condomínio preservando a ordem original estrita do cadastro
   */
  async obterUnidadesCondominio(leitura, unidadesParam = null) {
    if (Array.isArray(unidadesParam) && unidadesParam.length > 0) {
      return unidadesParam
        .map(u => (typeof u === 'object' ? (u.numero || u.identificador || u.nome || u.unidade) : String(u || '')))
        .map(u => String(u).trim())
        .filter(Boolean);
    }

    const condId = leitura?.id || leitura?.condominio_id;

    // 1. Filesystem (Directory.Data)
    if (condId) {
      try {
        const fileName = `unidades_${condId}.json`;
        const fileResult = await Filesystem.readFile({
          path: fileName,
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        });
        if (fileResult.data) {
          const parsed = JSON.parse(fileResult.data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
              .map(u => (typeof u === 'object' ? (u.numero || u.identificador || u.nome || u.unidade) : String(u || '')))
              .map(u => String(u).trim())
              .filter(Boolean);
          }
        }
      } catch (_) {}

      // 2. localStorage
      try {
        const salvas = localStorage.getItem(`unidades_${condId}`);
        if (salvas) {
          const parsed = JSON.parse(salvas);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
              .map(u => (typeof u === 'object' ? (u.numero || u.identificador || u.nome || u.unidade) : String(u || '')))
              .map(u => String(u).trim())
              .filter(Boolean);
          }
        }
      } catch (_) {}

      // 3. Supabase
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('unidades')
            .select('*')
            .eq('condominio_id', condId);
          if (!error && data && data.length > 0) {
            return data
              .map(u => u.numero || u.identificador || u.unidade || u.nome)
              .map(u => String(u || '').trim())
              .filter(Boolean);
          }
        } catch (_) {}
      }
    }

    // 4. leitura.unidades
    if (Array.isArray(leitura?.unidades) && leitura.unidades.length > 0) {
      return leitura.unidades
        .map(u => (typeof u === 'object' ? (u.numero || u.identificador || u.nome || u.unidade) : String(u || '')))
        .map(u => String(u).trim())
        .filter(Boolean);
    }

    return [];
  },

  /**
   * Gera uma planilha Excel no padrão uCondo e dispara compartilhamento nativo.
   * Realiza o Cruzamento (Join) direto entre as unidades cadastradas e os valores salvos.
   */
  async exportarParaWhatsApp(leitura, servicoFiltro = 'todos', unidadesParam = null, valoresParam = {}) {
    try {
      const nomeLimpo = String(leitura?.nome || 'Condominio')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
      const condId = leitura?.id || leitura?.condominio_id;

      // 1. Obtém as unidades na ordem original estrita do cadastro
      const unidades = await this.obterUnidadesCondominio(leitura, unidadesParam);

      if (!unidades || unidades.length === 0) {
        await customAlert('Nenhuma unidade cadastrada encontrada para este condomínio.');
        return false;
      }

      // Validação Canônica de Leitura Atual < Leitura Anterior antes de exportar
      const falhasValidacao = [];

      const validarServico = (srv) => {
        const srvUpper = srv.toUpperCase();

        unidades.forEach(unidade => {
          const nomeOriginal = typeof unidade === 'object'
            ? String(unidade.nome || unidade.numero || unidade.identificador || unidade.unidade || '').trim()
            : String(unidade || '').trim();

          const valorBrutoAtual = this.obterValorLeitura(condId, nomeOriginal, srv, valoresParam);
          const atualNum = parseLeituraNumerica(valorBrutoAtual);

          // Se a leitura atual for ausente (pendente / não lida neste lote), não valida regressão
          if (atualNum === null) return;

          const antNum = obterLeituraAnterior(condId, nomeOriginal, srvUpper);
          if (antNum !== null) {
            // Normaliza para 4 casas decimais para evitar falso menor por representação float
            const atualFixed = Math.round(atualNum * 10000);
            const antFixed = Math.round(antNum * 10000);

            if (atualFixed < antFixed) {
              falhasValidacao.push({
                unidade: nomeOriginal,
                servico: srvUpper,
                anterior: antNum,
                atual: atualNum,
              });
            }
          }
        });
      };

      if (servicoFiltro !== 'todos') {
        validarServico(String(servicoFiltro));
      } else {
        validarServico('AGUA');
        validarServico('GAS');
      }

      if (falhasValidacao.length > 0) {
        const listaMsg = falhasValidacao
          .map(f => `- ${f.unidade} (${f.servico}): Atual ${String(f.atual).replace('.', ',')} < Anterior ${String(f.anterior).replace('.', ',')}`)
          .join('\n');
        await customAlert(
          `Existem leituras atuais menores que as leituras anteriores.\n\nVerifique as seguintes unidades:\n${listaMsg}\n\nConfira os valores antes de exportar.`,
          'Leitura Regressiva Detectada'
        );
        return false;
      }

      const wb = XLSX.utils.book_new();

      // 2. Mapeamento das unidades com Cruzamento de Dados (Join)
      if (servicoFiltro === 'todos') {
        await customAlert('Por exigência do uCondo, a planilha de exportação deve conter apenas uma aba "Consumos". Por favor, exporte cada serviço (Água ou Gás) separadamente.', 'Atenção');
        return false;
      }

      // 2. Mapeamento das unidades com Cruzamento de Dados (Join)
      const servico = String(servicoFiltro).toUpperCase();
      const dadosExcel = unidades.map(unidade => {
        const nomeOriginal = typeof unidade === 'object'
          ? String(unidade.nome || unidade.numero || unidade.identificador || unidade.unidade || '').trim()
          : String(unidade || '').trim();

        const valorBruto = this.obterValorLeitura(condId, nomeOriginal, servico, valoresParam);
        const valorFormatado = this.formatarValorLeitura(valorBruto);

        return {
          'Unidade *': nomeOriginal,
          'Leitura atual *': valorFormatado,
        };
      });

      const ws = XLSX.utils.json_to_sheet(dadosExcel);

      // Aplica o tipo texto 's' e formato '@' na coluna B (Leitura atual *)
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const addrA = XLSX.utils.encode_cell({c: 0, r: R});
        const addrB = XLSX.utils.encode_cell({c: 1, r: R});
        if(ws[addrA]) {
          ws[addrA].t = 's';
        }
        if(ws[addrB]) {
          ws[addrB].t = 's';
          ws[addrB].z = '@';
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, 'Consumos');

      // 3. Criação do arquivo Excel (.xlsx)
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

      const base64Data = btoa(
        new Uint8Array(excelBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const suffix = servicoFiltro === 'todos' ? 'Geral' : servicoFiltro.toUpperCase();
      const fileName = `uCondo_${nomeLimpo}_${suffix}_${Date.now()}.xlsx`;

      // 4. Salva temporariamente no Cache do dispositivo
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      });

      // 5. Dispara o compartilhamento nativo
      await Share.share({
        title: `uCondo ${suffix} - ${leitura?.nome || ''}`,
        text: `Planilha de consumos (${suffix}) - ${leitura?.nome || ''} pronta para importação no uCondo.`,
        url: result.uri,
        dialogTitle: 'Enviar Planilha Excel',
      });

      return true;
    } catch (error) {
      if (error.name === 'AbortError' || error.message?.includes('canceled') || error.message?.includes('cancelled')) {
        return false;
      }
      await customAlert('Erro ao gerar planilha uCondo: ' + error.message);
      return false;
    }
  },
};

export const ExcelExportService = LeituraService;
export default LeituraService;


