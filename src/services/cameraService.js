/**
 * Serviço responsável pelo processamento, carimbo de auditoria e compressão de imagens.
 * As fotos carimbadas servem como comprovante legal auditável para moradores e inquilinos.
 */

/**
 * Processa uma imagem (File, Blob ou Data URL Base64), adiciona carimbo de auditoria no canto inferior direito
 * e exporta em JPEG com compressão otimizada.
 *
 * @param {File|Blob|string} imageInput - Arquivo de imagem ou URL/Base64.
 * @param {Object} options - Configurações e metadados obrigatórios.
 * @param {string} options.unidade - Identificação da unidade (ex: "1-101").
 * @param {string} options.servico - Tipo de serviço (ex: "ÁGUA").
 * @param {Date} [options.timestamp] - Data/Hora customizada (default: agora).
 * @returns {Promise<string>} Base64 (sem o prefixo) da imagem carimbada e comprimida.
 */
export const processAndStampImage = (imageInput, options = {}) => {
  return new Promise((resolve, reject) => {
    const { unidade, servico, timestamp = new Date() } = options;

    if (!unidade || !servico) {
      return reject(new Error('Unidade e Serviço são obrigatórios para o carimbo de auditoria.'));
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // 1. Redimensionamento Proporcional (Largura Máxima: 1080px)
        const maxWidth = 1080;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        // 2. Inicialização do Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Desenha a imagem base redimensionada
        ctx.drawImage(img, 0, 0, width, height);

        // 3. Estrutura das Linhas de Texto (Canto Inferior Direito)
        const dateStr = timestamp.toLocaleDateString('pt-BR');
        const timeStr = timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const line1 = `UNID: ${unidade} | ${servico.toUpperCase()}`;
        const line2 = `DATA: ${dateStr} ${timeStr}`;
        const textLines = [line1, line2];

        // 4. Cálculo Dinâmico de Fonte (Math.max(14, 2.5% da largura))
        const fontSize = Math.max(14, Math.round(width * 0.025));
        const padding = 15; // Padding das bordas do canvas
        const boxPadding = Math.round(fontSize * 0.6);
        const lineHeight = fontSize * 1.4;

        ctx.font = `bold ${fontSize}px sans-serif`;

        // Calcula largura máxima para o fundo
        let maxTextWidth = 0;
        textLines.forEach((line) => {
          const metrics = ctx.measureText(line);
          if (metrics.width > maxTextWidth) {
            maxTextWidth = metrics.width;
          }
        });

        const boxWidth = maxTextWidth + boxPadding * 2;
        const boxHeight = textLines.length * lineHeight + boxPadding;

        // Posição do fundo (Canto Inferior Direito)
        const boxX = width - boxWidth - padding;
        const boxY = height - boxHeight - padding;

        // 5. Renderização da Tarja de Contraste (rgba(0, 0, 0, 0.75))
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // 6. Renderização do Texto Branco Alinhado à Direita
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        textLines.forEach((line, index) => {
          const textX = width - padding - boxPadding;
          const textY = boxY + (boxPadding / 2) + (index * lineHeight);
          ctx.fillText(line, textX, textY);
        });

        // 7. Compressão JPEG 0.6
        const stampedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const base64 = stampedDataUrl.split(',')[1];

        console.log("-> Imagem carimbada com sucesso. Tamanho base64:", base64.length);
        console.log("✅ Foto carimbada gerada com sucesso para unidade:", unidade);
        resolve(base64);
      } catch (error) {
        reject(new Error(`Erro ao aplicar carimbo: ${error.message}`));
      }
    };

    img.onerror = () => reject(new Error('Falha ao carregar a imagem.'));

    if (typeof imageInput === 'string') {
      img.src = imageInput;
    } else if (imageInput instanceof File || imageInput instanceof Blob) {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(imageInput);
    } else {
      reject(new Error('Formato de entrada inválido.'));
    }
  });
};
