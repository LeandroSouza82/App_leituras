import * as XLSX from 'xlsx';

const formatCurrency = (value) =>
  Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

export const gerarRelatorioExcel = (leituras, mesAno) => {
  const rows = leituras.map((item) => [
    item.nome,
    item.apartamentos,
    item.diaLeitura,
    formatCurrency(item.valor),
    item.completo ? 'Concluído' : 'Pendente',
  ]);

  const total = leituras.reduce((sum, item) => sum + Number(item.valor), 0);

  const worksheetData = [
    ['Nome do Condomínio', 'Qtd. Unidades', 'Dia da Leitura', 'Valor Cobrado (R$)', 'Status'],
    ...rows,
    [],
    ['TOTAL A RECEBER (R$)', '', '', formatCurrency(total), ''],
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');

  const excelBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });

  const fileName = `Relatorio_Leituras_${mesAno.replace(/\s+/g, '_')}.xlsx`;
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return new File([blob], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};
