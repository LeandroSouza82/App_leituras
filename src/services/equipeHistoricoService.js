import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { supabase } from './supabase.js';
import { chamarEquipe } from './equipeConviteService.js';

const TAMANHO_PAGINA = 1000;

export async function exportarHistoricoEquipe(condominio, mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Escolha um mês válido.');

  const [ano, numeroMes] = mes.split('-').map(Number);
  const inicio = new Date(ano, numeroMes - 1, 1).toISOString();
  const fim = new Date(ano, numeroMes, 1).toISOString();
  const perfis = await chamarEquipe('equipe_listar_autores') || [];
  const emails = new Map(perfis.map(perfil => [perfil.id, perfil.email]));
  const leituras = [];

  for (let pagina = 0; ; pagina += 1) {
    const offset = pagina * TAMANHO_PAGINA;
    const { data, error } = await supabase.from('leituras_detalhes')
      .select('unidade_id, servico, leitura_atual, data_leitura, leiturista_id, foto_url')
      .eq('condominio_id', condominio.id)
      .gte('data_leitura', inicio)
      .lt('data_leitura', fim)
      .order('data_leitura')
      .order('id')
      .range(offset, offset + TAMANHO_PAGINA - 1);

    if (error) throw error;
    leituras.push(...data);
    if (data.length < TAMANHO_PAGINA) break;
  }

  if (leituras.length === 0) throw new Error('Nenhuma leitura vinculada a este condomínio foi sincronizada no período.');

  const dados = leituras.map(item => ({
    Condomínio: condominio.nome,
    Unidade: item.unidade_id,
    Serviço: item.servico,
    Leitura: Number(item.leitura_atual),
    Data: new Date(item.data_leitura).toLocaleString('pt-BR'),
    Leiturista: emails.get(item.leiturista_id) || 'Conta removida',
    Foto: item.foto_url ? 'Sim' : 'Não',
  }));
  const arquivo = XLSX.utils.book_new();
  const planilha = XLSX.utils.json_to_sheet(dados);
  planilha['!cols'] = [28, 14, 14, 14, 24, 32, 10].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(arquivo, planilha, 'Leituras');

  const nome = 'Leituras-' + condominio.nome.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 100) + '-' + mes + '.xlsx';
  if (!Capacitor.isNativePlatform()) {
    const dadosBinarios = XLSX.write(arquivo, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([dadosBinarios], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nome);
    return;
  }

  const conteudo = XLSX.write(arquivo, { bookType: 'xlsx', type: 'base64' });
  const { uri } = await Filesystem.writeFile({ path: nome, data: conteudo, directory: Directory.Cache });
  await Share.share({ title: 'Leituras da equipe', files: [uri] });
}
