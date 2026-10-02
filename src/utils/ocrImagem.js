import { classificarCorDigito, normalizarLinhaVisor } from './ocrVisor.js';

// Uma dúvida do motor pode localizar pixels, mas nunca define uma leitura.
const TEXTO_LOCALIZAVEL = /^\d[\d?\s]*(?:[a-z]{1,2})?$/i;

// Localiza uma faixa candidata a partir do texto já encontrado pelo motor.
// A margem à direita inclui os decimais que a primeira passagem pode ter omitido.
export const calcularRecorteVisor = (linha, largura, altura) => {
  const texto = linha?.text?.trim() || '';
  if (!TEXTO_LOCALIZAVEL.test(texto)) return null;
  const posicoes = texto.replace(/\s/g, '');
  const duvidas = (posicoes.match(/\D/g) || []).length;
  const reconhecidos = posicoes.length - duvidas;
  if (posicoes.length < 3 || posicoes.length > 10 || duvidas > 2 ||
      (duvidas && reconhecidos < 4) ||
      (posicoes.length === 3 && !posicoes.startsWith('0'))) return null;
  const caixas = linha.boundingBox ? [linha.boundingBox] :
    (linha.elements || []).map(e => e.boundingBox);
  if (!caixas.length || caixas.some(c => !c ||
      ![c.left, c.top, c.right, c.bottom].every(Number.isFinite) ||
      c.left < 0 || c.top < 0 || c.right > largura || c.bottom > altura ||
      c.right <= c.left || c.bottom <= c.top)) return null;
  const base = {
    left: Math.min(...caixas.map(c => c.left)),
    top: Math.min(...caixas.map(c => c.top)),
    right: Math.max(...caixas.map(c => c.right)),
    bottom: Math.max(...caixas.map(c => c.bottom)),
  };
  const w = base.right - base.left;
  const h = base.bottom - base.top;
  if (h < 8 || w / h < 2 || w / h > 30) return null;
  // A caixa de um trecho termina no traço do último dígito, antes do espaço
  // do próximo rolete. Usa os intervalos entre dígitos para não cortar a cauda.
  const intervalos = linha.trecho ? posicoes.length - 1 : posicoes.length;
  const margemDireita = posicoes.length <= 6 ? w / intervalos * 4 : h * 0.25;
  return {
    base,
    left: Math.max(0, Math.floor(base.left - h * 0.25)),
    top: Math.max(0, Math.floor(base.top - h * 0.35)),
    right: Math.min(largura, Math.ceil(base.right + margemDireita + h * 0.25)),
    bottom: Math.min(altura, Math.ceil(base.bottom + h * 0.35)),
  };
};

// Ajuste local de tons de cinza: só modifica os pixels da cópia de trabalho.
// Não transforma texto, completa números nem escolhe casas decimais.
export const realcarContrasteOcr = (pixels) => {
  const total = pixels.length / 4;
  if (!total) return false;
  const histograma = new Uint32Array(256);
  const tons = new Uint8Array(total);
  let escuros = 0;
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const tom = Math.round(pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722);
    tons[i] = tom;
    histograma[tom]++;
    if (tom < 128) escuros++;
  }
  let acumulado = 0;
  let minimo = 0;
  let maximo = 255;
  for (let tom = 0; tom < 256; tom++) {
    acumulado += histograma[tom];
    if (acumulado < total * 0.02) minimo = tom;
    if (acumulado >= total * 0.98) { maximo = tom; break; }
  }
  if (maximo - minimo < 30) return false;
  const inverter = escuros / total > 0.55;
  for (let i = 0; i < total; i++) {
    const contraste = Math.max(0, Math.min(255, Math.round((tons[i] - minimo) * 255 / (maximo - minimo))));
    const tom = inverter ? 255 - contraste : contraste;
    const p = i * 4;
    pixels[p] = pixels[p + 1] = pixels[p + 2] = tom;
  }
  return true;
};

const copiarComContraste = (canvas, ctx) => {
  if (!ctx) return null;
  const original = canvas.toDataURL('image/jpeg', 0.95);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!realcarContrasteOcr(pixels.data)) return null;
  ctx.putImageData(pixels, 0, 0);
  return { original, contraste: canvas.toDataURL('image/jpeg', 0.95) };
};

// A faixa escolhida pelo leiturista já é o recorte. Não depende de o motor
// localizar uma linha primeiro e não corta novamente os dígitos da cauda.
export const prepararContrasteEnquadrado = async (imagem) => {
  const foto = new Image();
  const canvas = document.createElement('canvas');
  try {
    foto.src = imagem;
    await foto.decode();
    canvas.width = foto.naturalWidth;
    canvas.height = foto.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(foto, 0, 0);
    return copiarComContraste(canvas, ctx);
  } finally {
    canvas.width = canvas.height = 0;
    foto.src = '';
  }
};

export const prepararRecorteVisor = async (imagem, blocks, diagnosticar = () => {}) => {
  if (!blocks?.length || typeof document === 'undefined') return null;
  const foto = new Image();
  foto.src = imagem;
  await foto.decode();
  const fonte = document.createElement('canvas');
  const recorte = document.createElement('canvas');
  fonte.width = foto.naturalWidth;
  fonte.height = foto.naturalHeight;
  try {
    const ctx = fonte.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(foto, 0, 0);
    const candidatos = [];
    const detalhes = [];
    const anotar = detalhe => { if (detalhes.length < 8) detalhes.push(detalhe); };
    // Letras podem ter sido anexadas a outro grupo da mesma linha ("0001 74m").
    // Uma dúvida ou letra final pode localizar pixels, sem convertê-la em
    // número. A leitura continua dependendo do novo reconhecimento do visor.
    const faixas = blocks.flatMap(b => b.lines || []).flatMap(linha => {
      if (/^\d[\d?\s]*$/.test(linha.text?.trim() || '')) return [linha];
      const normalizada = normalizarLinhaVisor(linha);
      // A união das caixas numéricas exclui a unidade, inclusive o 3 de m³.
      if (normalizada) return [normalizada];
      return (linha.elements || []).filter(e => TEXTO_LOCALIZAVEL.test(e.text?.trim() || ''))
        .map(e => ({ ...e, trecho: true }));
    });
    for (const linha of faixas) {
      const caixa = calcularRecorteVisor(linha, fonte.width, fonte.height);
      if (!caixa) { anotar(`${linha.text}: sem caixa numérica utilizável`); continue; }
      const { base } = caixa;
      const x = Math.floor(base.left);
      const y = Math.floor(base.top);
      const w = Math.max(1, Math.floor((base.right - base.left) / 3));
      const h = Math.max(1, Math.floor(base.bottom - base.top));
      // A cor neutra de um prefixo começando com zero pode falhar por reflexo.
      // Isso permite só recortar; não confirma a divisão decimal da leitura.
      const esquerda = classificarCorDigito(ctx.getImageData(x, y, w, h).data);
      const direita = x + w;
      const corDireita = classificarCorDigito(ctx.getImageData(direita, y, caixa.right - direita, h).data);
      anotar(`${linha.text}: ${esquerda || '?'} / ${corDireita || '?'}; caixa ${x},${y} ${Math.round(base.right - base.left)}×${h}`);
      const prefixoNeutro = esquerda == null && /^\s*0/.test(linha.text) &&
        (linha.text.match(/\d/g) || []).length >= 4;
      if ((esquerda !== 'preto' && !prefixoNeutro) || corDireita !== 'vermelho') continue;
      if (prefixoNeutro) anotar('Prefixo neutro usado somente para localizar o recorte');
      candidatos.push(caixa);
    }
    if (detalhes.length) diagnosticar(`Trechos examinados para recorte:\n${detalhes.join('\n')}`);
    diagnosticar(`${candidatos.length} faixa(s) candidata(s) ao recorte`);
    if (candidatos.length !== 1) return null;
    const caixa = candidatos[0];
    recorte.width = caixa.right - caixa.left;
    recorte.height = caixa.bottom - caixa.top;
    const destino = recorte.getContext('2d', { willReadFrequently: true });
    if (!destino) return null;
    destino.drawImage(fonte, caixa.left, caixa.top, recorte.width, recorte.height,
      0, 0, recorte.width, recorte.height);
    // Mantém a cópia colorida no mesmo tamanho para interpretar as caixas
    // retornadas pelo reconhecimento da versão com contraste.
    diagnosticar(`Recorte: ${caixa.left},${caixa.top} ${recorte.width}×${recorte.height}`);
    return copiarComContraste(recorte, destino);
  } finally {
    fonte.width = fonte.height = recorte.width = recorte.height = 0;
    foto.src = '';
  }
};
