import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

/**
 * Gera e realiza o download do relatório em Excel (.xlsx) com a lista de condomínios
 * e a rota mensal fixa, aplicando estilizações específicas.
 *
 * @param {Array} dadosCondominios - Lista de condomínios com seus dados de leitura
 * @param {string} mesAno - Mês e ano de referência (ex: "Agosto 2026")
 * @param {number} valorMoto - Valor fixo da rota mensal (padrão: 1650)
 * @returns {Promise<{ blob: Blob, fileName: string, buffer: ArrayBuffer }>}
 */
export const gerarRelatorioLeiturasExcel = async (dadosCondominios = [], mesAno = '', valorMoto = 1650) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fast Leituras';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Relatório de Leituras', {
    views: [{ showGridLines: true }],
  });

  // 1. Configuração e Larguras das Colunas
  worksheet.columns = [
    { key: 'nome', width: 32 },
    { key: 'unidades', width: 14 },
    { key: 'dia', width: 14 },
    { key: 'valor', width: 20 },
    { key: 'status', width: 18 },
  ];

  // 2. Linha 1: Cabeçalho
  const headerRow = worksheet.addRow([
    'Nome do Condomínio',
    'Qtd. Unidades',
    'Dia da Leitura',
    'Valor Cobrado (R$)',
    'Status',
  ]);

  headerRow.height = 24;

  headerRow.eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF002060' }, // Azul Marinho Escuro Hex #002060
    };
    cell.font = {
      name: 'Calibri',
      family: 2,
      size: 11,
      bold: true,
      color: { argb: 'FFFFC000' }, // Dourado/Amarelo Hex #FFC000
    };

    if (colNumber === 1) {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    } else if (colNumber === 4) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    };
  });

  // 3. Linhas de Dados (Condomínios)
  dadosCondominios.forEach((item) => {
    const qtdUnidades = Number(item.apartamentos ?? item.quantidade_unidades ?? item.unidades ?? 0);
    const diaLeitura = item.diaLeitura ?? item.dia_leitura ?? item.dia ?? '';
    const valorCobrado = Number(item.valor ?? item.valor_cobrado ?? 0);
    const statusTexto = item.completo || item.status === 'Concluído' ? 'Concluído' : 'Pendente';

    const row = worksheet.addRow([
      String(item.nome || '').trim(),
      qtdUnidades || '',
      diaLeitura ? `Dia ${String(diaLeitura).replace(/dia\s*/i, '')}` : '',
      valorCobrado,
      statusTexto,
    ]);

    row.height = 20;

    // Coluna A: Negrito
    const cellA = row.getCell(1);
    cellA.font = { name: 'Calibri', size: 11, bold: true };
    cellA.alignment = { vertical: 'middle', horizontal: 'left' };

    // Coluna B: Centralizado
    const cellB = row.getCell(2);
    cellB.font = { name: 'Calibri', size: 11 };
    cellB.alignment = { vertical: 'middle', horizontal: 'center' };

    // Coluna C: Centralizado
    const cellC = row.getCell(3);
    cellC.font = { name: 'Calibri', size: 11 };
    cellC.alignment = { vertical: 'middle', horizontal: 'center' };

    // Coluna D: Numérico, alinhado à direita, formato moeda
    const cellD = row.getCell(4);
    cellD.font = { name: 'Calibri', size: 11 };
    cellD.alignment = { vertical: 'middle', horizontal: 'right' };
    cellD.numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00;"R$ "0.00';

    // Coluna E: Centralizado
    const cellE = row.getCell(5);
    cellE.font = {
      name: 'Calibri',
      size: 11,
      color: { argb: statusTexto === 'Concluído' ? 'FF166534' : 'FF854D0E' },
      bold: true,
    };
    cellE.alignment = { vertical: 'middle', horizontal: 'center' };

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // 4. Linha Fixa da Moto ("Rota mensal")
  const rowMoto = worksheet.addRow(['Rota mensal', '', '', Number(valorMoto || 1650), '']);
  rowMoto.height = 20;

  const cellMotoA = rowMoto.getCell(1);
  cellMotoA.font = { name: 'Calibri', size: 11, bold: true };
  cellMotoA.alignment = { vertical: 'middle', horizontal: 'left' };

  const cellMotoD = rowMoto.getCell(4);
  cellMotoD.font = { name: 'Calibri', size: 11, bold: true };
  cellMotoD.alignment = { vertical: 'middle', horizontal: 'right' };
  cellMotoD.numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00;"R$ "0.00';

  rowMoto.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  });

  // 5. Linha Final (TOTAL A RECEBER)
  const linhaFinalIndex = rowMoto.number + 1;
  const linhaAnterior = rowMoto.number;

  const rowTotal = worksheet.addRow([
    'TOTAL A RECEBER (R$)',
    '',
    '',
    { formula: `SUM(D2:D${linhaAnterior})` },
    '',
  ]);

  rowTotal.height = 22;

  rowTotal.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC000' }, // Dourado/Amarelo Hex #FFC000
    };
    cell.font = {
      name: 'Calibri',
      family: 2,
      size: 11,
      bold: true,
      color: { argb: 'FF000000' }, // Preto
    };

    if (colNumber === 1) {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    } else if (colNumber === 4) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00;"R$ "0.00';
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    cell.border = {
      top: { style: 'medium', color: { argb: 'FF002060' } },
      bottom: { style: 'double', color: { argb: 'FF002060' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    };
  });

  // 6. Geração do Buffer e Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const mesAnoSanitizado = (mesAno || 'Mes_Atual')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  const fileName = `Relatorio_Leituras_${mesAnoSanitizado}.xlsx`;

  // Se estiver em ambiente nativo Capacitor (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      });

      await Share.share({
        title: 'Relatório de Leituras',
        text: `Segue o relatório de faturamento - ${mesAno}`,
        url: result.uri,
        dialogTitle: 'Exportar Planilha Excel',
      });
    } catch (nativeErr) {
      console.warn('[relatorioExcelService] Erro no Share nativo, usando saveAs fallback:', nativeErr);
      saveAs(blob, fileName);
    }
  } else {
    // Ambiente Web Desktop / Mobile Browser
    saveAs(blob, fileName);
  }

  return { blob, fileName, buffer };
};
