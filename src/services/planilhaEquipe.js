import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { formatarValorLeitura, gerarArquivoConsumos } from './planilhaUcondo.js';
import { NOMES_SERVICO } from '../utils/servicosCondominio.js';

const nomeUnidade = unidade => String(unidade.numero || unidade.identificador || unidade.nome || '').trim();
const apelidos = unidade => [unidade.numero, unidade.nome, unidade.identificador]
  .filter(nome => nome != null && String(nome).trim() !== '')
  .map(nome => String(nome).trim());

/**
 * Cruza as unidades (na ordem do cadastro) com as leituras do mês de um serviço.
 * Dispensadas saem "0.0000"; havendo mais de uma leitura da unidade, vale a mais recente.
 */
export function montarConsumosEquipe(unidades, leituras, servico) {
  const alvo = String(servico).toUpperCase();
  const recentes = new Map();
  for (const leitura of leituras) {
    if (String(leitura.servico).toUpperCase() !== alvo) continue;
    const chave = String(leitura.unidade_id).trim();
    const atual = recentes.get(chave);
    if (!atual || new Date(leitura.data_leitura) >= new Date(atual.data_leitura)) recentes.set(chave, leitura);
  }

  const faltando = [];
  const linhas = unidades.map(unidade => {
    const nome = nomeUnidade(unidade);
    const dispensada = (unidade.servicos_sem_medidor || []).some(s => String(s).toUpperCase() === alvo);
    if (dispensada) return { unidade: nome, leitura: formatarValorLeitura(0) };
    const encontrada = apelidos(unidade).map(apelido => recentes.get(apelido)).find(Boolean);
    const leitura = encontrada ? formatarValorLeitura(encontrada.leitura_atual) : '';
    if (!leitura) faltando.push(nome);
    return { unidade: nome, leitura };
  });
  return { linhas, faltando };
}

export function gerarPlanilhaEquipe(unidades, leituras, servico) {
  if (!unidades.length) throw new Error('Nenhuma unidade cadastrada encontrada para este condomínio.');
  const { linhas, faltando } = montarConsumosEquipe(unidades, leituras, servico);
  if (faltando.length) {
    const rotulo = (NOMES_SERVICO[servico] || servico).toUpperCase();
    throw new Error(`Planilha de ${rotulo} não gerada: ${faltando.length} unidade(s) sem leitura no mês: ${faltando.join(', ')}.`);
  }
  return gerarArquivoConsumos(linhas);
}

export async function exportarPlanilhaEquipe(unidades, leituras, nome, mes, servico) {
  const bytes = gerarPlanilhaEquipe(unidades, leituras, servico);
  const limpar = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const arquivo = `uCondo_${limpar(nome)}_${String(servico).toUpperCase()}_${mes}.xlsx`;
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (!Capacitor.isNativePlatform()) {
    const { default: FileSaver } = await import('file-saver');
    FileSaver.saveAs(blob, arquivo);
    return;
  }
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { uri } = await Filesystem.writeFile({ path: arquivo, data, directory: Directory.Cache });
  await Share.share({ title: `uCondo ${NOMES_SERVICO[servico] || servico} - ${nome}`, files: [uri] });
}
