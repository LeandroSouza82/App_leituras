import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

/**
 * Serviço Sênior de Câmera e Persistência - Otimizado com CameraResultType.Uri para evitar OOM.
 */
export const CameraService = {
  /**
   * Captura foto otimizada com CameraResultType.Uri, mantendo o arquivo no disco sem carregar Base64 gigante na RAM.
   */
  async capturarFoto(unitLabel) {
    try {
      const photo = await Camera.getPhoto({
        quality: 100, // CRUCIAL: 100 impede que o Android destrua o EXIF antes da entrega
        allowEditing: false,
        resultType: CameraResultType.Uri, // Mantém a foto no disco e retorna URI leve
        source: CameraSource.Camera,
        correctOrientation: true, // Agora o Android conseguirá ler o EXIF intacto e rotacionar nativamente!
        saveToGallery: false,
        promptLabelHeader: unitLabel
      });

      return {
        webPath: photo.webPath,
        path: photo.path,
        format: photo.format
      };
    } catch (error) {
      console.error('[Camera] Erro na captura da foto:', error);
      throw error;
    }
  },

  // Alias para compatibilidade retroativa
  async capturarFotoBase64(unitLabel) {
    return this.capturarFoto(unitLabel);
  },

  /**
   * Persiste os dados na raiz do armazenamento permanente (Directory.Data)
   * e retorna a URL web segura da WebView via Capacitor.convertFileSrc().
   */
  async salvarFotoNaRaiz(base64Data, fileName) {
    try {
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Data,
        recursive: true
      });

      const finalUri = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Data
      });

      const webUrl = Capacitor.convertFileSrc(finalUri.uri);

      console.log('[FileSystem] Foto persistida com sucesso na raiz:', fileName);

      return { path: fileName, uri: finalUri.uri, webUrl };
    } catch (error) {
      console.error('[FileSystem] Erro ao gravar arquivo:', error);
      throw error;
    }
  },

  /**
   * Persiste a foto organizadamente em subpastas (ex: FastLeituras/[Condominio]/[Apto].jpg)
   */
  async salvarFotoEmPasta(base64Data, pastaCondominio, fileName) {
    try {
      const fullPath = `${pastaCondominio}/${fileName}`;
      await Filesystem.writeFile({
        path: fullPath,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true
      });

      const finalUri = await Filesystem.getUri({
        path: fullPath,
        directory: Directory.Cache
      });

      const webUrl = Capacitor.convertFileSrc(finalUri.uri);

      console.log('[FileSystem] Foto persistida com sucesso na pasta:', fullPath);

      return { path: fullPath, uri: finalUri.uri, webUrl };
    } catch (error) {
      console.error('[FileSystem] Erro ao gravar arquivo na pasta:', error);
      throw error;
    }
  },

  /**
   * Upload direto para o Supabase Storage.
   */
  async uploadParaSupabase(localPath, remotePath) {
    try {
      const fileData = await Filesystem.readFile({
        path: localPath,
        directory: Directory.Data
      });

      // Converte Base64 para Blob eficiente
      const byteCharacters = atob(fileData.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const { data, error } = await supabase.storage
        .from('fotos_leituras')
        .upload(remotePath, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[Supabase] Falha no upload:', error);
      throw error;
    }
  }
};
