/**
 * zipFotosService.js
 *
 * Responsabilidade unica: compactar o staging temporario usando a API nativa
 * CapacitorZip e retornar o URI compartilhavel do ZIP.
 *
 * Toda conversao de caminho nativo (file://) fica ISOLADA aqui —
 * nenhum outro modulo precisa lidar com paths nativos.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { CapacitorZip } from '@capgo/capacitor-zip';

const ZIP_OUT_DIR = 'zip_exports';

/**
 * Gera o ZIP nativo a partir do diretorio de staging preparado.
 *
 * @param {{
 *   stagingDir: string,          // caminho relativo no Cache (ex: "zip_export_tmp/Lindolfo_dos_Santos")
 *   nomeCondo: string,           // nome sanitizado (ex: "Lindolfo_dos_Santos")
 *   nomeZip: string,             // nome do arquivo ZIP (ex: "Lindolfo_dos_Santos_09-2026.zip")
 *   totalFotos: number,
 *   servicosEncontrados: string[]
 * }} params
 *
 * @returns {Promise<{
 *   zipUri: string,
 *   nomeZip: string,
 *   totalFotos: number,
 *   servicosEncontrados: string[]
 * }>}
 */
/**
 * Garante que o diretorio de saida de ZIPs existe no Cache.
 * - Se ja existir: reutiliza sem erro.
 * - Se nao existir: cria com mkdir.
 * - Outros erros (permissao, etc.): propagados — nao sao engolidos.
 */
const garantirDiretorioSaida = async () => {
  try {
    await Filesystem.stat({ path: ZIP_OUT_DIR, directory: Directory.Cache });
    // stat ok -> diretorio ja existe, nada a fazer
  } catch (statErr) {
    // stat falhou: se for "not found", criar o diretorio
    const msg = String(statErr?.message || statErr).toLowerCase();
    if (msg.includes('not found') || msg.includes('does not exist') || msg.includes('enoent') || msg.includes('no such')) {
      await Filesystem.mkdir({ path: ZIP_OUT_DIR, directory: Directory.Cache, recursive: true });
    } else {
      // Erro inesperado (ex: permissao) — propagar
      throw statErr;
    }
  }
};

export const gerarZipNativo = async ({
  stagingDir,
  nomeCondo,
  nomeZip,
  totalFotos,
  servicosEncontrados,
}) => {
  // Garantir pasta de saida sem falhar se ja existir
  await garantirDiretorioSaida();

  const zipRelPath = `${ZIP_OUT_DIR}/${nomeZip}`;

  // Remover ZIP anterior de mesmo nome, se existir
  // Ignora somente erro de arquivo nao encontrado; outros erros sao propagados.
  try {
    await Filesystem.deleteFile({ path: zipRelPath, directory: Directory.Cache });
  } catch (delErr) {
    const msg = String(delErr?.message || delErr).toLowerCase();
    if (!msg.includes('not found') && !msg.includes('does not exist') && !msg.includes('enoent') && !msg.includes('no such')) {
      throw delErr;
    }
    // Arquivo nao existia — silencioso
  }

  // Obter URI nativo do diretorio de staging (pasta que sera compactada)
  const srcUriResult = await Filesystem.getUri({
    path: stagingDir,
    directory: Directory.Cache,
  });
  // Converter file:// para caminho absoluto (CapacitorZip espera path absoluto no Android)
  const srcPath = srcUriResult.uri.replace(/^file:\/\//, '');

  // Obter URI nativo do diretorio de saida
  const destDirUriResult = await Filesystem.getUri({
    path: ZIP_OUT_DIR,
    directory: Directory.Cache,
  });
  const destDirPath = destDirUriResult.uri.replace(/^file:\/\//, '');
  const destZipPath = `${destDirPath}/${nomeZip}`;

  // Compactar via plugin nativo — sem leitura de Base64 em memoria
  await CapacitorZip.zip({
    source: srcPath,
    destination: destZipPath,
    includeParentFolder: true, // garante <NomeCondo>/ dentro do ZIP
  });

  // Obter URI compartilhavel do ZIP gerado
  const zipUriResult = await Filesystem.getUri({
    path: zipRelPath,
    directory: Directory.Cache,
  });

  return {
    zipUri: zipUriResult.uri,
    nomeZip,
    totalFotos,
    servicosEncontrados,
  };
};
