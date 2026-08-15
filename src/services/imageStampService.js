/**
 * Serviço especializado em processamento de imagem via HTML5 Canvas.
 * Aplica carimbo de auditoria (Data/Hora) em fotos de medidores.
 */
export const ImageStampService = {
  /**
   * Aplica um carimbo de data e hora em uma imagem base64.
   * @param {string} base64Data - String base64 da imagem original (sem prefixo).
   * @returns {Promise<string>} Nova string base64 com o carimbo aplicado.
   */
  async applyTimestamp(base64Data) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Garante que o prefixo data:image/jpeg;base64 existirá para o carregamento
      img.src = base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;

      img.onload = () => {
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
        ctx.roundRect ? ctx.roundRect(posX, posY, rectWidth, rectHeight, 8) : ctx.fillRect(posX, posY, rectWidth, rectHeight);
        if (ctx.fill) ctx.fill(); else ctx.fillRect(posX, posY, rectWidth, rectHeight);

        // 6. Desenha o texto do carimbo
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(stampText, posX + padding, posY + padding/2);

        // 7. Exporta com compressão otimizada (0.6)
        const stampedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        // Retorna apenas o conteúdo base64 (sem o prefixo data:image/...)
        resolve(stampedBase64.split(',')[1]);
      };

      img.onerror = (err) => {
        console.error('[ImageStamp] Erro ao carregar imagem no Canvas:', err);
        reject(err);
      };
    });
  }
};
