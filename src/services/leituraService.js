import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import * as XLSX from 'xlsx';

/**
 * leituraService - Módulo modular para gerenciamento de arquivos de leituras offline.
 */
export const LeituraService = {
  /**
   * Garante que a pasta de armazenamento local '/leituras/' exista.
   */
  async garantirPastaLeituras() {
    try {
      await Filesystem.mkdir({
        path: 'leituras',
        directory: Directory.Data,
        recursive: true,
      });
      return true;
    } catch (error) {
      if (error.message && error.message.includes('already exists')) return true;
      return false;
    }
  },

  /**
   * Gera uma planilha Excel no padrão uCondo e compartilha.
   * @param {Object} leitura - Objeto do condomínio
   * @param {String} servicoFiltro - 'agua', 'gas', 'energia' ou 'todos'
   */
  async exportarParaWhatsApp(leitura, servicoFiltro = 'todos') {
    try {
      const nomeLimpo = leitura.nome.replace(/\s+/g, '_');

      // 1. Localiza arquivos deste condomínio no diretório
      const { files } = await Filesystem.readdir({
        path: 'leituras',
        directory: Directory.Data
      });

      const padraoCondo = files
        .map(f => typeof f === 'string' ? f : f.name)
        .filter(name => {
          const startsWithCondo = name.startsWith(nomeLimpo);
          if (!startsWithCondo) return false;

          if (servicoFiltro === 'todos') return true;
          return name.includes(`_${servicoFiltro.toUpperCase()}_`);
        });

      if (padraoCondo.length === 0) {
        alert(`Nenhuma leitura encontrada para ${servicoFiltro === 'todos' ? 'este condomínio' : servicoFiltro.toUpperCase()}.`);
        return false;
      }

      // 2. Mapeia os dados para o padrão uCondo
      const dadosConsumo = padraoCondo.map(fileName => {
        const partes = fileName.split('_');
        if (partes.length < 3) return null;

        const unidadeRaw = partes[1]; // Ex: A-0101

        return {
          'Unidade *': unidadeRaw,
          'Leitura atual *': 0
        };
      }).filter(Boolean);

      // Remove duplicatas de unidades
      const unidadesUnicas = [];
      const seen = new Set();
      for (const item of dadosConsumo) {
        if (!seen.has(item['Unidade *'])) {
          seen.add(item['Unidade *']);
          unidadesUnicas.push(item);
        }
      }

      // 3. Cria o arquivo Excel (.xlsx)
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(unidadesUnicas);
      XLSX.utils.book_append_sheet(wb, ws, 'Consumos');

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

      // 4. Salva temporariamente no Cache
      const base64Data = btoa(
        new Uint8Array(excelBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const suffix = servicoFiltro === 'todos' ? 'Geral' : servicoFiltro.toUpperCase();
      const fileName = `uCondo_${nomeLimpo}_${suffix}_${new Date().getTime()}.xlsx`;
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });

      // 5. Dispara o compartilhamento nativo
      await Share.share({
        title: `uCondo ${suffix} - ${leitura.nome}`,
        text: `Planilha de consumos (${suffix}) pronta para importação.`,
        url: result.uri,
        dialogTitle: 'Enviar para WhatsApp'
      });

      return true;
    } catch (error) {
      console.error('Erro na exportação Excel:', error);
      alert('Erro ao gerar planilha uCondo: ' + error.message);
      return false;
    }
  }
};
