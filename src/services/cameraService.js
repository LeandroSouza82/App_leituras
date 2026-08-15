import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { supabase } from './supabase';

/**
 * Serviço Sênior de Câmera e Persistência - Otimizado para evitar OOM e erros de "Invalid Path".
 */
export const CameraService = {
  /**
   * Captura foto com compressão extrema e retorna Base64 puro.
   * Evita erros de path baseados em URLs de WebView.
   */
  async capturarFotoBase64(unitLabel) {
    try {
      const photo = await Camera.getPhoto({
        quality: 15, // Compressão de 85% para manter arquivo ultraleve (25-40KB)
        width: 800,
        allowEditing: false,
        resultType: CameraResultType.Base64, // Retorna string Base64 para gravação direta
        source: CameraSource.Camera,
        correctOrientation: true,
        promptLabelHeader: unitLabel
      });

      return {
        base64: photo.base64String,
        format: photo.format,
        webPath: `data:image/${photo.format};base64,${photo.base64String}`
      };
    } catch (error) {
      console.error('[Camera] Erro na captura Base64:', error);
      throw error;
    }
  },

  /**
   * Persiste os dados Base64 diretamente na raiz do armazenamento permanente (Flat Storage).
   * Elimina totalmente o erro de "Invalid Path" por não depender de caminhos temporários.
   */
  async salvarFotoNaRaiz(base64Data, fileName) {
    try {
      // 1. Salvamento Direto na Raiz do Directory.Data
      // O nome do arquivo é gerado de forma plana e limpa.
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

      console.log('[FileSystem] Foto persistida com sucesso na raiz:', fileName);

      return { path: fileName, uri: finalUri.uri };
    } catch (error) {
      console.error('[FileSystem] Erro ao gravar arquivo Base64:', error);
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
