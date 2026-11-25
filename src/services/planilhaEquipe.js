import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function exportarPlanilhaEquipe(leituras, nome, mes) {
  const planilha = new ExcelJS.Workbook();
  const aba = planilha.addWorksheet('Leituras da equipe');
  aba.columns = [
    { header: 'Unidade', key: 'unidade_id', width: 20 },
    { header: 'Serviço', key: 'servico', width: 16 },
    { header: 'Leitura', key: 'leitura_atual', width: 18, style: { numFmt: '0.0000' } },
    { header: 'Data da leitura', key: 'data_leitura', width: 26 },
    { header: 'Foto no app', key: 'foto', width: 16 },
  ];
  aba.getRow(1).font = { bold: true };
  for (const leitura of leituras) {
    aba.addRow({
      ...leitura,
      leitura_atual: Number(leitura.leitura_atual),
      data_leitura: new Date(leitura.data_leitura).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      foto: leitura.foto_url ? 'Sim' : '',
    });
  }
  const bytes = await planilha.xlsx.writeBuffer();
  const nomeSeguro = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const arquivo = `Leituras_${nomeSeguro}_${mes}.xlsx`;
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (!Capacitor.isNativePlatform()) {
    saveAs(blob, arquivo);
    return;
  }
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { uri } = await Filesystem.writeFile({ path: arquivo, data, directory: Directory.Cache });
  await Share.share({ title: 'Planilha de leituras', files: [uri] });
}
