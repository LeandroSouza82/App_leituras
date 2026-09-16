/**
 * fotoExportService.js
 *
 * Orquestrador: prepara staging → gera ZIP → compartilha via Share nativo.
 * Nao acessa estado React. Recebe apenas os dados necessarios do condominio.
 *
 * Limpeza do ZIP temporario:
 *   - NAO apaga o ZIP imediatamente apos Share.share().
 *   - O staging e limpo no INICIO da proxima exportacao (via prepararStaging).
 *   - O Android pode limpar o Cache naturalmente.
 */

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { prepararStaging } from './fotoZipStagingService';
import { gerarZipNativo } from './zipFotosService';
import { gerarNomeZip } from '../utils/zipFotosNaming';

/**
 * Exporta o lote de fotos de um condominio como ZIP e dispara o Share nativo do Android.
 *
 * @param {{
 *   nome: string,
 *   pathFisico: string,
 *   arquivos: Array<{ name: string }>
 * }} condo
 *
 * @throws {Error} Se nao estiver em plataforma nativa, ou se houver falha em qualquer etapa.
 */
export const exportarFotosCondominioZip = async (condo) => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Exportacao ZIP disponivel no aplicativo Android.');
  }

  // 1. Preparar staging (copia arquivos sem recompressao)
  const { stagingDir, nomeCondo, totalFotos, servicosEncontrados } =
    await prepararStaging(condo);

  // 2. Gerar nome do ZIP com competencia local atual
  const nomeZip = gerarNomeZip(condo.nome);

  // 3. Compactar via plugin nativo
  const { zipUri } = await gerarZipNativo({
    stagingDir,
    nomeCondo,
    nomeZip,
    totalFotos,
    servicosEncontrados,
  });

  // 4. Compartilhar via Share nativo do Android
  // ZIP NAO e apagado aqui — alguns apps receptores ainda podem estar lendo.
  await Share.share({
    title: `${condo.nome} — Fotos ${nomeZip.replace('.zip', '')}`,
    text: `Lote de fotos (${totalFotos} foto(s) — ${servicosEncontrados.join(', ')})`,
    url: zipUri,
    dialogTitle: `Compartilhar ZIP: ${nomeZip}`,
  });
};
