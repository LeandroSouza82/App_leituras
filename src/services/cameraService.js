/**
 * cameraService - Utilitários modulares para processamento de imagens e carimbos de auditoria.
 */
export const CameraService = {
  /**
   * Processa uma imagem base64, redimensionando e adicionando carimbo de data/hora oficial.
   * @param {string} base64Uri - URI da imagem capturada.
   * @param {string} unitLabel - Identificador da unidade (ex: A-0101).
   * @param {string} serviceLabel - Tipo de serviço (ex: ÁGUA).
   * @returns {Promise<string>} - Base64 da imagem final (sem prefixo).
   */
  processarFotoComCarimbo(base64Uri, unitLabel, serviceLabel) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64Uri;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 1. Redimensionamento Inteligente (Máximo 1080px de largura)
        const maxWidth = 1080;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // Desenha a imagem base
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 2. Cálculo Proporcional de Fonte e Espaçamento
        const fontSize = Math.max(16, Math.floor(canvas.width * 0.035));
        ctx.font = `bold ${fontSize}px Arial`;

        const now = new Date();
        const timestamp = now.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const line1 = `${unitLabel} - ${serviceLabel.toUpperCase()}`;
        const line2 = timestamp;

        const padding = 20;
        const textWidth1 = ctx.measureText(line1).width;
        const textWidth2 = ctx.measureText(line2).width;
        const bgWidth = Math.max(textWidth1, textWidth2) + (padding * 2);
        const bgHeight = (fontSize * 2.5) + (padding);

        // 3. Tarja de Fundo para Contraste (Canto Inferior Direito)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(canvas.width - bgWidth, canvas.height - bgHeight, bgWidth, bgHeight);

        // 4. Inserção do Texto (Alinhado à Direita)
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';

        ctx.fillText(line1, canvas.width - padding, canvas.height - (fontSize * 1.2) - (padding / 2));
        ctx.fillText(line2, canvas.width - padding, canvas.height - (padding / 2));

        // 5. Compressão e Conversão Final (JPEG 0.6)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem para o Canvas.'));
    });
  }
};
