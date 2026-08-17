/**
 * Serviço especializado em processamento de imagem via HTML5 Canvas.
 * Aplica carimbo de auditoria (Data/Hora) em fotos de medidores.
 */
export const ImageStampService = {
  /**
   * Aplica um carimbo de data e hora em uma imagem (URI, webPath ou Base64).
   * @param {string} imageSource - Caminho URI, webPath ou Base64 da imagem.
   * @returns {Promise<string>} String base64 pura com o carimbo aplicado pronta para escrita no disco.
   */
  async applyTimestamp(imageSource) {
    return new Promise((resolve, reject) => {
      if (!imageSource) {
        return reject(new Error('Fonte da imagem não fornecida para carimbo.'));
      }

      const img = new Image();

      // Suporta webPath (http/capacitor/blob), data URLs e base64 pura
      if (
        imageSource.startsWith('http://') ||
        imageSource.startsWith('https://') ||
        imageSource.startsWith('capacitor://') ||
        imageSource.startsWith('blob:') ||
        imageSource.startsWith('data:')
      ) {
        img.src = imageSource;
      } else {
        img.src = `data:image/jpeg;base64,${imageSource}`;
      }

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          // 1. Desenha a imagem original
          ctx.drawImage(img, 0, 0);

          // 2. Prepara a formatação da data (Padrão: DD/MM/YYYY HH:MM:SS)
          const now = new Date();
          const dateStr = now.toLocaleDateString('pt-BR');
          const timeStr = now.toLocaleTimeString('pt-BR');
          const stampText = `${dateStr} ${timeStr}`;

          // 3. Configura a fonte proporcional (aprox 2.5% da largura da imagem)
          const fontSize = Math.max(14, Math.floor(canvas.width * 0.025));
          ctx.font = `bold ${fontSize}px Arial, sans-serif`;

          // 4. Mede o texto para desenhar o fundo de contraste
          const textMetrics = ctx.measureText(stampText);
          const padding = fontSize * 0.5;
          const rectWidth = textMetrics.width + (padding * 2);
          const rectHeight = fontSize + (padding * 1.5);

          // Posição: Canto inferior direito com margem de segurança
          const margin = 20;
          const posX = canvas.width - rectWidth - margin;
          const posY = canvas.height - rectHeight - margin;

          // 5. Desenha fundo semi-transparente para garantir legibilidade
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          if (ctx.roundRect) {
            ctx.roundRect(posX, posY, rectWidth, rectHeight, 8);
          } else {
            ctx.fillRect(posX, posY, rectWidth, rectHeight);
          }
          if (ctx.fill) ctx.fill(); else ctx.fillRect(posX, posY, rectWidth, rectHeight);

          // 6. Desenha o texto do carimbo
          ctx.fillStyle = 'white';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(stampText, posX + padding, posY + padding / 2);

          // 7. Exporta com compressão otimizada (0.6)
          const stampedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
          const rawBase64 = stampedDataUrl.split(',')[1];

          // 8. Limpeza agressiva de memória do Canvas e Image para evitar vazamentos/OOM
          canvas.width = 0;
          canvas.height = 0;
          img.onload = null;
          img.onerror = null;
          img.src = '';

          resolve(rawBase64);
        } catch (canvasErr) {
          console.error('[ImageStamp] Erro no processamento do Canvas:', canvasErr);
          reject(canvasErr);
        }
      };

      img.onerror = (err) => {
        img.onload = null;
        img.onerror = null;
        console.error('[ImageStamp] Erro ao carregar imagem no Canvas:', err);
        reject(new Error('Falha ao processar carimbo na imagem.'));
      };
    });
  }
};
