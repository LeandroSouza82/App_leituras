import { customAlert, customConfirm } from '../components/CustomPrompt/CustomPrompt';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * Serviço Sênior para interceptar arquivos compartilhados via Intent do Android.
 * Suporta a captura de planilhas .xlsx, .xls e .csv.
 */
export const ShareIntentService = {
  /**
   * Inicializa o listener para capturar arquivos quando o app é aberto por um Intent externo.
   * @param {Function} onFileReceived - Callback executado quando um arquivo é processado.
   */
  init(onFileReceived) {
    // Listener para o evento de abertura via URL/File URI
    App.addListener('appUrlOpen', async (data) => {

      try {
        const fileUri = data.url;

        // Valida se o URI é de um arquivo (content:// ou file://)
        if (!fileUri.startsWith('content://') && !fileUri.startsWith('file://')) {
          return;
        }

        let arrayBuffer;
        try {
          // Tenta buscar o arquivo via fetch (muito comum em Intents do Android)
          const response = await fetch(fileUri);
          const blob = await response.blob();
          arrayBuffer = await blob.arrayBuffer();
        } catch (e) {
          // Fallback usando o Filesystem do Capacitor se necessário
          const readFileResult = await Filesystem.readFile({ path: fileUri });
          if (readFileResult && readFileResult.data) {
            arrayBuffer = 'data:application/octet-stream;base64,' + readFileResult.data;
          }
        }

        let fileName = fileUri.substring(fileUri.lastIndexOf('/') + 1) || `shared_${Date.now()}.xlsx`;
        fileName = decodeURIComponent(fileName.split('?')[0]);

        if (arrayBuffer && onFileReceived) {
          onFileReceived({
            name: fileName,
            data: arrayBuffer,
            originalUri: fileUri
          });
        }
      } catch (error) {
      }
    });
  },

  /**
   * Processa o URI do arquivo, copia para a pasta interna do app e retorna os metadados.
   */
  async handleIncomingFile(uri) {
    try {
      // 1. Tenta ler o arquivo diretamente pelo caminho da URI (file:// ou path absoluto)
      let fileData = null;
      try {
        const readDirect = await Filesystem.readFile({ path: uri });
        if (readDirect && readDirect.data) {
          fileData = readDirect.data;
        }
      } catch (_) {}

      // 1.5. INTERCEPÇÃO CIRÚRGICA: Leitura Prévia de Planilha de Leituras Anteriores
      if (fileData) {
        try {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(fileData, { type: 'base64' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

          // Identificação Inteligente
          let isPlanilhaLeitura = false;
          let hasCondominio = false;
          let hasConsumo = false;

          for (let i = 0; i < Math.min(15, rawData.length); i++) {
            const rowStr = (rawData[i] || []).join(' ').toLowerCase();
            if ((rowStr.includes('condomínio') || rowStr.includes('condominio')) && rowStr.includes('consumo de')) {
              isPlanilhaLeitura = true;
              break;
            }
          }

          if (isPlanilhaLeitura) {
            const desejaSalvar = await customConfirm("Planilha de leitura anterior detectada. Deseja salvar os dados?");
            if (desejaSalvar) {
              const leiturasAnteriores = [];
              let startRow = 6; // linha 7 (índice 6)
              let unidadeCol = 1; // Coluna B (índice 1)
              let leituraCol = 3; // Coluna D (índice 3)

              // Mapeamento dinâmico de colunas para garantir robustez
              for(let i = 0; i < Math.min(15, rawData.length); i++) {
                const row = rawData[i] || [];
                const rowStr = row.join(' ').toLowerCase();
                if (rowStr.includes('unidade') && (rowStr.includes('anterior') || rowStr.includes('leitura') || rowStr.includes('consumo'))) {
                   startRow = i + 1;
                   for (let c = 0; c < row.length; c++) {
                      const cell = String(row[c] || '').toLowerCase();
                      if (cell.includes('unidade')) unidadeCol = c;
                      if (cell.includes('anterior') || cell.includes('leitura') || (cell.includes('fechamento') && !cell.includes('nova'))) leituraCol = c;
                   }
                   break;
                }
              }

              // Processamento Offline e Conversão
              for (let i = startRow; i < rawData.length; i++) {
                 const row = rawData[i];
                 if (!row || row.length === 0) continue;
                 
                 const unidade = String(row[unidadeCol] || '').trim();
                 const leituraRaw = String(row[leituraCol] || '').trim();
                 
                 if (unidade && !unidade.toLowerCase().includes('total') && leituraRaw) {
                    const leituraNum = parseFloat(leituraRaw.replace(/\./g, '').replace(',', '.'));
                    if (!isNaN(leituraNum)) {
                       leiturasAnteriores.push({
                          unidade,
                          leitura_anterior: leituraNum
                       });
                    }
                 }
              }

              if (leiturasAnteriores.length > 0) {
                 localStorage.setItem('leituras_anteriores', JSON.stringify(leiturasAnteriores));
                 await customAlert(`✅ ${leiturasAnteriores.length} leituras anteriores salvas no dispositivo!`);
              } else {
                 await customAlert('Nenhuma leitura válida encontrada na planilha.');
              }
            }
            // Aborta o fluxo padrão para planilhas de leitura anterior, não importando como cadastro
            return { cancelado: true };
          }
        } catch (excelErr) {
          console.error("Erro na intercepção de leitura anterior:", excelErr);
        }
      }

      // 2. Garante que a pasta de destino existe
      const targetDir = 'planilhas_recebidas';
      try {
        await Filesystem.mkdir({
          path: targetDir,
          directory: Directory.Data,
          recursive: true
        });
      } catch (ignored) {}

      // 3. Extrai o nome do arquivo do URI ou gera um timestamp
      let fileName = uri.substring(uri.lastIndexOf('/') + 1) || `shared_${Date.now()}.xlsx`;
      fileName = decodeURIComponent(fileName.split('?')[0]);
      if (!fileName.toLowerCase().endsWith('.xlsx') && !fileName.toLowerCase().endsWith('.xls') && !fileName.toLowerCase().endsWith('.csv')) {
        fileName += '.xlsx';
      }

      const targetPath = `${targetDir}/${fileName}`;

      // Se temos os dados diretos, salva no Directory.Data
      if (fileData) {
        await Filesystem.writeFile({
          path: targetPath,
          data: fileData,
          directory: Directory.Data
        });

        try {
          // Indicador visual temporário
          await customAlert('Sincronizando... Iniciando leitura e atualização.');
          
          // Import dinâmico para evitar dependência circular se houver
          const { UCondoImportService } = await import('./ucondoImportService');
          await UCondoImportService.processarPlanilhaCadastro(
            fileName,
            fileData,
            [] // Condomínios existentes (pode ser resolvido dentro do serviço)
          );
        } catch (syncErr) {
          console.error("Erro ao sincronizar planilha no ShareIntent:", syncErr);
        }

      } else {
        // Copia usando copy
        await Filesystem.copy({
          from: uri,
          to: targetPath,
          toDirectory: Directory.Data
        });

        try {
          // Indicador visual temporário
          await customAlert('Sincronizando... Iniciando leitura e atualização.');
          
          // Lê os dados recém-salvos para enviar ao processamento
          const lido = await Filesystem.readFile({ path: targetPath, directory: Directory.Data });
          if (lido && lido.data) {
            const { UCondoImportService } = await import('./ucondoImportService');
            await UCondoImportService.processarPlanilhaCadastro(
              fileName,
              lido.data,
              []
            );
          }
        } catch (syncErr) {
          console.error("Erro ao sincronizar planilha copiada no ShareIntent:", syncErr);
        }
      }


      return {
        name: fileName,
        path: targetPath,
        originalUri: uri
      };
    } catch (error) {
      throw error;
    }
  }
};
