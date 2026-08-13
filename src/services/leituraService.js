import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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
   * Gera um CSV e compartilha junto com as fotos do condomínio.
   */
  async exportarParaWhatsApp(leitura) {
    try {
      const nomeLimpo = leitura.nome.replace(/\s+/g, '_');

      // 1. Localiza fotos deste condomínio no diretório
      const { files } = await Filesystem.readdir({
        path: 'leituras',
        directory: Directory.Data
      });

      const fotosCondominio = files
        .map(f => typeof f === 'string' ? f : f.name)
        .filter(name => name.startsWith(nomeLimpo))
        .map(name => `leituras/${name}`);

      // 2. Gera Conteúdo CSV (Simulado - pegando unidades fotografadas)
      const csvHeader = 'Unidade *;Leitura atual *\n';
      const csvRows = fotosCondominio.map(path => {
        const unidade = path.split('_')[1] || 'AP-Desconhecido';
        return `${unidade};0`; // O valor "0" deve ser substituído pela leitura real se houver input
      }).join('\n');

      const csvFileName = `Export_${nomeLimpo}_${new Date().getTime()}.csv`;

      // 3. Salva CSV temporário no Cache para compartilhamento
      const savedCsv = await Filesystem.writeFile({
        path: csvFileName,
        data: btoa(csvHeader + csvRows),
        directory: Directory.Cache,
        encoding: 'utf8'
      });

      // 4. Compartilha o CSV (Android permite compartilhar um arquivo por vez via Share API simples)
      // Para múltiplas fotos + CSV, o ideal é zipar ou enviar o CSV que referencia as fotos.
      await Share.share({
        title: `Exportação ${leitura.nome}`,
        text: `Relatório de leituras e evidências do condomínio ${leitura.nome}`,
        url: savedCsv.uri,
        dialogTitle: 'Enviar para WhatsApp'
      });

      return true;
    } catch (error) {
      console.error('Erro na exportação:', error);
      alert('Erro ao exportar: ' + error.message);
      return false;
    }
  }
};
