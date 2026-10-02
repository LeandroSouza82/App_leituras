// Recurso temporário: liberar os pixels não muda a identidade da sessão React
// nem apaga a leitura que o usuário já digitou ou conferiu.
export const criarImagemTemporariaOcr = (imagem, enquadrada = false, erro = null) => {
  const listeners = new Set();
  let liberada = false;
  return {
    enquadrada, erro,
    ler: () => imagem,
    aoLiberar: listener => {
      if (liberada) listener();
      else listeners.add(listener);
      return () => listeners.delete(listener);
    },
    liberar: () => {
      if (liberada) return;
      liberada = true; imagem = null;
      listeners.forEach(listener => listener());
      listeners.clear();
    },
  };
};

// A prévia nativa e a foto precisam mostrar a mesma proporção do sensor.
// Se a câmera não comprovar isso, conserva a foto e deixa a leitura manual.
export const calcularRecorteEnquadrado = (largura, altura, viewport, guia, previa = null) => {
  const medidas = [largura, altura, viewport?.width, viewport?.height,
    guia?.left, guia?.top, guia?.width, guia?.height];
  if (!medidas.every(Number.isFinite) || medidas.slice(0, 4).some(n => n <= 0) ||
      guia.width <= 0 || guia.height <= 0 || guia.left < 0 || guia.top < 0 ||
      guia.left + guia.width > viewport.width + 0.5 ||
      guia.top + guia.height > viewport.height + 0.5) return null;
  if (previa && (!Number.isFinite(previa.width) || !Number.isFinite(previa.height) ||
      previa.width <= 0 || previa.height <= 0 ||
      Math.abs((largura / altura) / (previa.width / previa.height) - 1) > 0.01)) return null;

  // Mesma projeção central (cover) usada pelo SurfaceView do plugin Android.
  const escala = Math.max(viewport.width / largura, viewport.height / altura);
  const sobraX = (largura * escala - viewport.width) / 2;
  const sobraY = (altura * escala - viewport.height) / 2;
  const left = Math.max(0, Math.floor((guia.left + sobraX) / escala));
  const top = Math.max(0, Math.floor((guia.top + sobraY) / escala));
  const right = Math.min(largura, Math.ceil((guia.left + guia.width + sobraX) / escala));
  const bottom = Math.min(altura, Math.ceil((guia.top + guia.height + sobraY) / escala));
  return right > left && bottom > top ? { left, top, right, bottom } : null;
};

// Só a versão JPEG 30 entra no carimbo/armazenamento existente. O recorte
// colorido JPEG 95 fica no recurso descartável, nunca no payload de salvamento.
export const prepararCapturaEnquadrada = async (imagem, viewport, guia, previa = null) => {
  const foto = new Image();
  const completa = document.createElement('canvas');
  const recorte = document.createElement('canvas');
  try {
    foto.src = imagem;
    await foto.decode();
    completa.width = foto.naturalWidth;
    completa.height = foto.naturalHeight;
    const ctx = completa.getContext('2d');
    if (!ctx) throw new Error('Não foi possível preparar a foto.');
    ctx.drawImage(foto, 0, 0);
    const fotoComprimida = completa.toDataURL('image/jpeg', 0.3);
    const caixa = calcularRecorteEnquadrado(completa.width, completa.height, viewport, guia, previa);
    if (!caixa) return {
      fotoComprimida,
      imagemOcr: criarImagemTemporariaOcr(null, true, 'Não foi possível relacionar o guia à foto. Digite a leitura.'),
    };
    recorte.width = caixa.right - caixa.left;
    recorte.height = caixa.bottom - caixa.top;
    const destino = recorte.getContext('2d');
    if (!destino) throw new Error('Não foi possível preparar a área de leitura.');
    destino.drawImage(completa, caixa.left, caixa.top, recorte.width, recorte.height,
      0, 0, recorte.width, recorte.height);
    return { fotoComprimida, imagemOcr: criarImagemTemporariaOcr(recorte.toDataURL('image/jpeg', 0.95), true) };
  } finally {
    completa.width = completa.height = recorte.width = recorte.height = 0;
    foto.src = '';
    imagem = null;
  }
};
