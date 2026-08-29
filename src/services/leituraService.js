import { customAlert, customConfirm } from '../components/CustomPrompt/CustomPrompt';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StorageService } from './storageService';
import { supabase } from './supabase';
import * as XLSX from 'xlsx';

/**
 * leituraService - Módulo modular para gerenciamento e exportação de leituras no padrão uCondo.
 */
export const LeituraService = {
  /**
   * Converte e formata o valor bruto para o formato numérico/decimal esperado pelo Excel do uCondo
   */
  formatarValorLeitura(valor) {
    if (valor === null || valor === undefined || valor === '' || valor === 0 || valor === '0') {
      return 0;
    }
    if (typeof valor === 'number') {
      return isNaN(valor) ? 0 : valor;
    }
    const sanitized = String(valor).trim().replace(',', '.');
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
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
      // 1.1 Acesso direto
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

    // 2. Busca no LocalStorage por chaves específicas
    const chavesPossiveis = [
      `valor_${condIdStr}_${unidadeStr}_${servicoKey}`,
      `valor_${condIdStr}_${unidadeStr}_${servicoKey.toUpperCase()}`,
      `valor_${condIdStr}_${unidadeStr}_${servico}`,
      `valor_${unidadeStr}_${servicoKey}`,
    ];

    for (const ch of chavesPossiveis) {
      const val = localStorage.getItem(ch);
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        return val;
      }
    }

    // 3. Varredura flexível no LocalStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('valor_')) {
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

    // 4. Busca na fila de sincronização offline (fila_sync_auto)
    try {
      const fila = JSON.parse(localStorage.getItem('fila_sync_auto') || '[]');
      if (Array.isArray(fila)) {
        const item = fila.find(
          f =>
            String(f.unidade_id || f.unidadeId || '').trim().toLowerCase() === unidadeStr.toLowerCase() &&
            String(f.servico || f.tipoServico || '').trim().toLowerCase() === servicoKey
        );
        if (item?.leitura_atual !== undefined && item?.leitura_atual !== null && String(item.leitura_atual).trim() !== '') {
          return item.leitura_atual;
        }
      }
    } catch (_) {}

    // 5. Busca na fila de pendências offline (leituras_pendentes / pendencias_offline)
    try {
      const pendencias = JSON.parse(
        localStorage.getItem('leituras_pendentes') || localStorage.getItem('pendencias_offline') || '[]'
      );
      if (Array.isArray(pendencias)) {
        const item = pendencias.find(
          f =>
            String(f.unidade_id || f.unidadeId || '').trim().toLowerCase() === unidadeStr.toLowerCase() &&
            String(f.servico || f.tipoServico || '').trim().toLowerCase() === servicoKey
        );
        if (item?.leitura_atual !== undefined && item?.leitura_atual !== null && String(item.leitura_atual).trim() !== '') {
          return item.leitura_atual;
        }
      }
    } catch (_) {}

    return 0;
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

      const wb = XLSX.utils.book_new();

      // 2. Mapeamento das unidades com Cruzamento de Dados (Join)
      if (servicoFiltro !== 'todos') {
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

        // Validação Explícita por Console

        const ws = XLSX.utils.json_to_sheet(dadosExcel);
        XLSX.utils.book_append_sheet(wb, ws, 'Consumos');
      } else {
        // Se 'todos', gera abas separadas por serviço (Água / Gás) preservando os dados
        const servicos = ['AGUA', 'GAS'];
        servicos.forEach(servico => {
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

          // Validação Explícita por Console

          const ws = XLSX.utils.json_to_sheet(dadosExcel);
          const abaNome = servico === 'AGUA' ? 'Água' : 'Gás';
          XLSX.utils.book_append_sheet(wb, ws, abaNome);
        });
      }

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


