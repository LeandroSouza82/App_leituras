/**
 * fotoZipStagingService.js
 *
 * Responsabilidade unica: preparar a estrutura temporaria de arquivos no Cache
 * para posterior compactacao. Usa Filesystem.copy — sem leitura de Base64,
 * sem recompressao, sem Canvas.
 *
 * ORIGEM:  Directory.Data / Backups/<condoPath>/<arquivo>
 * DESTINO: Directory.Cache / zip_export_tmp/<NomeCondo>/<SERVICO>/<arquivoLimpo>
 *
 * NUNCA modifica, move ou exclui arquivos em Directory.Data/Backups.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { interpretarNomeFoto, sanitizarNomeCondominio } from '../utils/zipFotosNaming';

const TMP_ROOT = 'zip_export_tmp';

/**
 * Limpa APENAS o diretorio temporario de staging no Cache.
 * Nunca toca em Directory.Data.
 */
export const limparStagingTemp = async () => {
  try {
    await Filesystem.rmdir({
      path: TMP_ROOT,
      directory: Directory.Cache,
      recursive: true,
    });
  } catch (_) {
    // Diretorio pode nao existir — silencioso
  }
};

/**
 * Prepara a estrutura temporaria para o ZIP de um condominio.
 *
 * @param {{
 *   nome: string,
 *   pathFisico: string,
 *   arquivos: Array<{ name: string }>
 * }} condo
 *
 * @returns {Promise<{
 *   stagingDir: string,         // caminho relativo no Cache (ex: "zip_export_tmp/Lindolfo_dos_Santos")
 *   nomeCondo: string,          // nome sanitizado
 *   totalFotos: number,
 *   servicosEncontrados: string[]
 * }>}
 *
 * @throws {Error} Se algum arquivo valido nao puder ser classificado por servico.
 */
export const prepararStaging = async (condo) => {
  const nomeCondo = sanitizarNomeCondominio(condo.nome);
  const stagingDir = `${TMP_ROOT}/${nomeCondo}`;

  // Limpa staging anterior para garantir estrutura limpa
  await limparStagingTemp();

  const servicosEncontrados = new Set();
  const destinosUsados = new Set(); // rastreia destPaths desta exportacao; evita sobrescrita silenciosa
  let totalFotos = 0;

  for (const arq of condo.arquivos) {
    const fileName = arq.name || arq;
    if (typeof fileName !== 'string') continue;

    // Ignorar nao-imagens
    if (!/\.(jpg|jpeg|png)$/i.test(fileName)) continue;

    const meta = interpretarNomeFoto(fileName);

    if (!meta) {
      // Arquivo de imagem valido que nao pode ser classificado — erro explícito
      throw new Error(
        `Nao foi possivel classificar o servico (AGUA/GAS/ENERGIA) do arquivo "${fileName}". ` +
        `Verifique o nome do arquivo antes de exportar o ZIP.`
      );
    }

    const { servico, nomeZip } = meta;
    const destDir = `${stagingDir}/${servico}`;
    const destPath = `${destDir}/${nomeZip}`;
    const srcPath = `Backups/${condo.pathFisico}/${fileName}`;

    // Bloquear colisao: dois arquivos fisicos distintos com mesmo destino no ZIP
    if (destinosUsados.has(destPath)) {
      throw new Error(
        `Foram encontradas fotos duplicadas para o mesmo destino no ZIP: "${nomeZip}". ` +
        `Verifique se ha arquivos com nomes conflitantes na pasta do condominio.`
      );
    }
    destinosUsados.add(destPath);

    // Criar pasta de servico (apenas quando necessario — nao cria pastas vazias)
    if (!servicosEncontrados.has(servico)) {
      await Filesystem.mkdir({
        path: destDir,
        directory: Directory.Cache,
        recursive: true,
      });
      servicosEncontrados.add(servico);
    }

    // Copiar sem leitura de conteudo — nao recomprime, nao altera original
    await Filesystem.copy({
      from: srcPath,
      to: destPath,
      directory: Directory.Data,
      toDirectory: Directory.Cache,
    });

    totalFotos++;
  }

  if (totalFotos === 0) {
    throw new Error('Nenhuma foto valida encontrada para exportar.');
  }

  return {
    stagingDir,
    nomeCondo,
    totalFotos,
    servicosEncontrados: [...servicosEncontrados],
  };
};
