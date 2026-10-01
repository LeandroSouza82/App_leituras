// Usa as caixas do ML Kit e a cor dos pixels, sem presumir casas decimais.
export const classificarCorDigito = (pixels) => {
  let vermelho = 0;
  let escuro = 0;
  const total = pixels.length / 4;
  if (!total) return null;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (r > 65 && r > g * 1.4 && r > b * 1.4 && r - Math.max(g, b) > 30) vermelho++;
    if (Math.max(r, g, b) < 125) escuro++;
  }
  if (vermelho / total >= 0.04) return 'vermelho';
  if (vermelho / total < 0.005 && escuro / total >= 0.02) return 'preto';
  return null;
};

export const interpretarVisor = (blocks, corElemento) => {
  const candidatos = [];
  for (const block of blocks || []) {
    for (const linha of block.lines || []) {
      if (!/^\d[\d\s]*$/.test(linha.text?.trim() || '')) continue;
      const elementos = linha.elements || [];
      if (!elementos.length || elementos.some(e => !/^\d+$/.test(e.text))) continue;
      if (elementos.map(e => e.text).join('') !== linha.text.replace(/\s/g, '')) continue;
      let inteiros = '';
      let decimais = '';
      let invalido = false;
      for (const elemento of elementos) {
        const cor = corElemento(elemento);
        if (cor === 'preto' && !decimais) inteiros += elemento.text;
        else if (cor === 'vermelho' && inteiros) decimais += elemento.text;
        else { invalido = true; break; }
      }
      if (!invalido && inteiros.length >= 3 && inteiros.length <= 6 &&
          decimais.length >= 1 && decimais.length <= 4) {
        candidatos.push(`${inteiros},${decimais}`);
      }
    }
  }
  return candidatos.length === 1 ? candidatos[0] : null;
};

// Só aceita elementos com cor uniforme. Elementos mistos precisam de outro
// reconhecimento: não divide uma caixa em posições inventadas para os dígitos.
export const reconhecerVisorPorCor = async (imagem, blocks) => {
  if (!blocks?.length || typeof document === 'undefined') return null;
  const foto = new Image();
  foto.src = imagem;
  await foto.decode();
  const canvas = document.createElement('canvas');
  canvas.width = foto.naturalWidth;
  canvas.height = foto.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(foto, 0, 0);
    return interpretarVisor(blocks, elemento => {
      const caixa = elemento.boundingBox;
      if (!caixa) return null;
      const x = Math.floor(caixa.left);
      const y = Math.floor(caixa.top);
      const w = Math.ceil(caixa.right) - x;
      const h = Math.ceil(caixa.bottom) - y;
      if (x < 0 || y < 0 || w <= 0 || h <= 0 ||
          x + w > canvas.width || y + h > canvas.height) return null;
      // Amostras das duas metades evitam aceitar uma caixa preto/vermelho mista.
      if (w < 2) return null;
      const metade = Math.floor(w / 2);
      const a = classificarCorDigito(ctx.getImageData(x, y, metade, h).data);
      const b = classificarCorDigito(ctx.getImageData(x + metade, y, w - metade, h).data);
      return a === b ? a : null;
    });
  } finally {
    canvas.width = canvas.height = 0;
  }
};
