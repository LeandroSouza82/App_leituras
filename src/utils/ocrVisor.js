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

export const interpretarVisor = (blocks, corElemento, diagnosticar = () => {}) => {
  const candidatos = [];
  for (const block of blocks || []) {
    for (const linha of block.lines || []) {
      if (!/^\d[\d\s]*$/.test(linha.text?.trim() || '')) {
        if (/\d/.test(linha.text || '')) diagnosticar('Linha recusada: contém outros caracteres');
        continue;
      }
      const elementos = linha.elements || [];
      if (!elementos.length || elementos.some(e => !/^\d+$/.test(e.text))) {
        diagnosticar('Linha numérica sem elementos válidos');
        continue;
      }
      if (elementos.map(e => e.text).join('') !== linha.text.replace(/\s/g, '')) {
        diagnosticar('Elementos não correspondem à linha');
        continue;
      }
      let inteiros = '';
      let decimais = '';
      let invalido = false;
      const cores = elementos.map(elemento => {
        const cor = corElemento(elemento);
        diagnosticar(`${elemento.text}: ${cor || 'cor indefinida'}`);
        return cor;
      });
      for (const [indice, elemento] of elementos.entries()) {
        const cor = cores[indice];
        if (cor === 'preto' && !decimais) inteiros += elemento.text;
        else if (cor === 'vermelho' && inteiros) decimais += elemento.text;
        else { invalido = true; break; }
      }
      if (!invalido && inteiros.length >= 3 && inteiros.length <= 6 &&
          decimais.length >= 1 && decimais.length <= 4) {
        candidatos.push(`${inteiros},${decimais}`);
      }
      else diagnosticar('Linha recusada: divisão preta/vermelha não confirmada');
    }
  }
  diagnosticar(`${candidatos.length} candidato(s) por cor`);
  return candidatos.length === 1 ? candidatos[0] : null;
};

// Inclui uma margem pequena para enxergar o fundo do rolete, inclusive quando
// os números são brancos. A caixa do OCR pode cobrir apenas o traço do dígito.
export const caixaAmostraVisor = (caixa, largura, altura) => {
  if (!caixa || ![caixa.left, caixa.top, caixa.right, caixa.bottom].every(Number.isFinite)) return null;
  const w = caixa.right - caixa.left;
  const h = caixa.bottom - caixa.top;
  if (w < 2 || h < 2 || caixa.left < 0 || caixa.top < 0 || caixa.right > largura || caixa.bottom > altura) return null;
  const margemX = Math.max(1, Math.round(w * 0.08));
  const margemY = Math.max(1, Math.round(h * 0.15));
  const left = Math.max(0, Math.floor(caixa.left) - margemX);
  const top = Math.max(0, Math.floor(caixa.top) - margemY);
  const right = Math.min(largura, Math.ceil(caixa.right) + margemX);
  const bottom = Math.min(altura, Math.ceil(caixa.bottom) + margemY);
  return { left, top, right, bottom };
};

// Só aceita elementos com cor uniforme. Elementos mistos precisam de outro
// reconhecimento: não divide uma caixa em posições inventadas para os dígitos.
export const reconhecerVisorPorCor = async (imagem, blocks, diagnosticar = () => {}) => {
  if (!blocks?.length || typeof document === 'undefined') return null;
  const foto = new Image();
  foto.src = imagem;
  await foto.decode();
  const canvas = document.createElement('canvas');
  canvas.width = foto.naturalWidth;
  canvas.height = foto.naturalHeight;
  diagnosticar(`Foto: ${canvas.width} × ${canvas.height}`);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(foto, 0, 0);
    return interpretarVisor(blocks, elemento => {
      const caixa = caixaAmostraVisor(elemento.boundingBox, canvas.width, canvas.height);
      if (!caixa) { diagnosticar('Coordenadas ausentes ou fora da foto'); return null; }
      const x = Math.floor(caixa.left);
      const y = Math.floor(caixa.top);
      const w = Math.ceil(caixa.right) - x;
      const h = Math.ceil(caixa.bottom) - y;
      if (x < 0 || y < 0 || w <= 0 || h <= 0 ||
          x + w > canvas.width || y + h > canvas.height) {
        diagnosticar('Coordenadas fora da foto');
        return null;
      }
      // Amostras das duas metades evitam aceitar uma caixa preto/vermelho mista.
      if (w < 2) return null;
      const metade = Math.floor(w / 2);
      const a = classificarCorDigito(ctx.getImageData(x, y, metade, h).data);
      const b = classificarCorDigito(ctx.getImageData(x + metade, y, w - metade, h).data);
      if (!a || !b || a !== b) diagnosticar(`Caixa ${x},${y} ${w}×${h}: ${a || '?'} / ${b || '?'}`);
      return a === b ? a : null;
    }, diagnosticar);
  } finally {
    canvas.width = canvas.height = 0;
  }
};
