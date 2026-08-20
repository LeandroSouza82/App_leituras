export const ImageStampService = {
  carimbarFotoComDados: async (photo, dadosUnidade) => {
    return new Promise(async (resolve, reject) => {
      try {
        let imageUrl = '';
        if (typeof photo === 'string') {
          imageUrl = photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
        } else if (photo?.webPath) {
          imageUrl = photo.webPath;
        } else if (photo?.base64String) {
          imageUrl = `data:image/jpeg;base64,${photo.base64String}`;
        }

        // Converte a url nativa em blob para o createImageBitmap aplicar a rotação correta
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        
        // Desenha a Tarja Minimalista
        const alturaRodape = canvas.height * 0.08;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, canvas.height - alturaRodape, canvas.width, alturaRodape);
        
        // Desenha o Texto (Ex: "APTO-101 | 19/08/2026")
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(24, canvas.height * 0.03)}px sans-serif`;
        ctx.textBaseline = 'middle';
        const dataAtual = new Date().toLocaleDateString('pt-BR');
        ctx.fillText(`${dadosUnidade.nome} | ${dataAtual}`, 40, canvas.height - (alturaRodape / 2));
        
        // VERSÃO 1: Alta qualidade para o WhatsApp (Cache)
        const dataUrlWhatsApp = canvas.toDataURL('image/jpeg', 0.9);
        const fotoWhatsApp = dataUrlWhatsApp.split(',')[1] || dataUrlWhatsApp;
        
        // VERSÃO 2: Compressão máxima para o Banco de Dados (Supabase)
        const MAX_WIDTH = 1200; // Redimensiona para economizar espaço conforme solicitado
        const proporcao = MAX_WIDTH / canvas.width;
        
        const novoCanvas = document.createElement('canvas');
        novoCanvas.width = MAX_WIDTH;
        novoCanvas.height = canvas.height * proporcao;
        const novoCtx = novoCanvas.getContext('2d');
        novoCtx.drawImage(canvas, 0, 0, novoCanvas.width, novoCanvas.height);
        
        // Qualidade 0.7 para ficar extremamente leve no estado offline/banco
        const dataUrlBanco = novoCanvas.toDataURL('image/jpeg', 0.7);
        const fotoBanco = dataUrlBanco.split(',')[1] || dataUrlBanco;
        
        resolve({ fotoWhatsApp, fotoBanco });
      } catch (error) {
        console.error("Erro ao processar dupla compressão:", error);
        reject(error);
      }
    });
  }
};
