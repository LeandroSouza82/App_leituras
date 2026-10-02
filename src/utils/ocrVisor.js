import { expandirSimbolosVisor, resolverTransicoesVisor, separarUnidadeSimbolos } from './ocrSimbolos.js';

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

// A cor pode falhar num trecho do inteiro. Só usa sua posição se todas as
// caixas formam uma faixa contínua, na ordem dos dígitos reconhecidos.
const elementosAlinhados = (elementos) => {
  const caixas = elementos.map(e => e.boundingBox);
  if (caixas.some(c => !c || ![c.left, c.top, c.right, c.bottom].every(Number.isFinite) ||
      c.left < 0 || c.top < 0 || c.right - c.left < 2 || c.bottom - c.top < 2)) return false;
  const alturas = caixas.map(c => c.bottom - c.top);
  const menorAltura = Math.min(...alturas);
  if (Math.max(...alturas) > menorAltura * 2) return false;
  const sobreposicaoVertical = Math.min(...caixas.map(c => c.bottom)) - Math.max(...caixas.map(c => c.top));
  if (sobreposicaoVertical < menorAltura * 0.5) return false;
  for (let i = 1; i < caixas.length; i++) {
    const anterior = caixas[i - 1];
    const atual = caixas[i];
    const larguraDigito = Math.max(
      (anterior.right - anterior.left) / elementos[i - 1].text.length,
      (atual.right - atual.left) / elementos[i].text.length,
    );
    const intervalo = atual.left - anterior.right;
    if (atual.left <= anterior.left || atual.right <= anterior.right ||
        intervalo < -larguraDigito * 0.25 || intervalo > larguraDigito * 1.5) return false;
  }
  return true;
};

// Na foto inteira, só separa a unidade como elemento próprio. No recorte,
// permite sufixos verificados pelos símbolos; conserva todos os dígitos.
export const normalizarLinhaVisor = (linha, ehRecorte = false) => {
  let text = linha?.text?.trim() || '';
  let elements = linha?.elements || [];
  let unidade = null;
  let unidadeAnexada = false;
  let tracoAgregado = false;
  // Alguns retornos contêm "0007 2933-" na linha, mas somente dígitos nos
  // elementos e símbolos. Só ignora esse traço ausente do contrato individual.
  if (ehRecorte && /^\d[\d\s]*-$/.test(text)) {
    if (!expandirSimbolosVisor(elements)?.individuais) return null;
    text = text.slice(0, -1).trim();
    tracoAgregado = true;
  }
  const ultimo = elements.at(-1)?.text;
  if (/^(?:m(?:3|³)?|kWh)$/i.test(ultimo || '')) {
    const partes = text.match(/^(.*?)\s+(\S+)$/);
    if (!partes || partes[2] !== ultimo) return null;
    text = partes[1].trim();
    elements = elements.slice(0, -1);
    unidade = ultimo;
  } else if (ehRecorte && /\d(?:m(?:3|³)?|kWh)$/i.test(ultimo || '')) {
    const separada = separarUnidadeSimbolos(elements.at(-1));
    if (!separada || !text.endsWith(separada.unidade)) return null;
    text = text.slice(0, -separada.unidade.length).trim();
    elements = [...elements.slice(0, -1), separada.elemento];
    unidade = separada.unidade;
    unidadeAnexada = true;
  }
  if (!/^\d[\d\s]*$/.test(text) || !elements.length ||
      elements.some(e => !/^\d+$/.test(e.text)) ||
      elements.map(e => e.text).join('') !== text.replace(/\s/g, '')) return null;
  return { text, elements, unidade, unidadeAnexada, tracoAgregado };
};

export const interpretarVisor = (blocks, corElemento, diagnosticar = () => {}, ehRecorte = false) => {
  const candidatos = [];
  const amostras = new Map();
  const corDoElemento = elemento => {
    if (!amostras.has(elemento)) amostras.set(elemento, corElemento(elemento));
    return amostras.get(elemento);
  };
  const linhas = (blocks || []).flatMap(b => b.lines || []).map(linha => {
    const normalizada = normalizarLinhaVisor(linha, ehRecorte);
    const expandida = normalizada && expandirSimbolosVisor(normalizada.elements);
    return { linha, normalizada, expandida };
  });
  for (const { linha, normalizada, expandida } of linhas) {
    if (!normalizada) {
      if (/\d/.test(linha.text || '')) diagnosticar(ehRecorte && /\d(?:m(?:3|³)?|kWh)$/i.test(linha.elements?.at(-1)?.text || '')
        ? 'Linha recusada: unidade anexada sem separação confirmada por símbolos'
        : 'Linha recusada: texto e elementos não formam visor numérico');
      continue;
    }
    if (!expandida) { diagnosticar('Linha recusada: símbolos incompletos ou caixas inválidas'); continue; }
    let elementos = expandida.elementos;
    if (expandida.individuais) {
      diagnosticar(`Analisando ${elementos.length} dígitos individuais`);
      const outros = linhas.filter(l => l.linha !== linha && l.expandida?.individuais)
        .flatMap(l => l.expandida.elementos);
      elementos = resolverTransicoesVisor(elementos, outros, corDoElemento, diagnosticar);
      if (!elementos) continue;
    } else diagnosticar('Símbolos individuais indisponíveis: análise por grupos');
    if ((normalizada.unidadeAnexada || normalizada.tracoAgregado) && !elementosAlinhados(elementos)) {
      diagnosticar('Linha recusada: faixa de dígitos descontínua no recorte');
      continue;
    }
    if (normalizada.unidadeAnexada && linha.elements.at(-1).symbols.slice(-normalizada.unidade.length)
      .some(s => corDoElemento(s) !== 'preto')) {
      diagnosticar('Linha recusada: unidade anexada fora da foto ou com cor não confirmada');
      continue;
    }
    if (normalizada.unidade) diagnosticar(`Unidade separada${normalizada.unidadeAnexada ? ' por símbolos' : ''}: ${normalizada.unidade}`);
    if (normalizada.tracoAgregado) diagnosticar('Traço final da linha ausente dos símbolos: dígitos conferidos');
    let inteiros = '';
    let decimais = '';
    let invalido = false;
    const cores = elementos.map(elemento => {
      const cor = corDoElemento(elemento);
      diagnosticar(`${elemento.text}: ${cor || 'cor indefinida'}`);
      return cor;
    });
    const inicioDecimais = cores.indexOf('vermelho');
    const prefixoIndefinido = inicioDecimais > 0 && cores[inicioDecimais - 1] === 'preto' &&
      cores.slice(0, inicioDecimais).some(c => c == null) &&
      cores.slice(0, inicioDecimais).every(c => c === 'preto' || c == null) &&
      cores.slice(inicioDecimais).every(c => c === 'vermelho');
    const prefixoPorPosicao = prefixoIndefinido && elementosAlinhados(elementos);
    if (prefixoIndefinido && !prefixoPorPosicao) diagnosticar('Prefixo recusado: caixas não alinhadas');
    for (const [indice, elemento] of elementos.entries()) {
      const cor = cores[indice];
      if (!decimais && (cor === 'preto' || (cor == null && prefixoPorPosicao && indice < inicioDecimais))) inteiros += elemento.text;
      else if (cor === 'vermelho' && inteiros) decimais += elemento.text;
      else { invalido = true; break; }
    }
    if (!invalido && inteiros.length >= 3 && inteiros.length <= 6 &&
        decimais.length >= 1 && decimais.length <= 4) {
      if (prefixoPorPosicao) diagnosticar('Prefixo inteiro confirmado pela posição antes do preto');
      candidatos.push(`${inteiros},${decimais}`);
    }
    else diagnosticar('Linha recusada: divisão preta/vermelha não confirmada');
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

// Cor confirmada exige amostras uniformes. Um prefixo indefinido só entra pela
// posição antes de uma âncora preta; nunca divide uma caixa para inventar dígitos.
export const reconhecerVisorPorCor = async (imagem, blocks, diagnosticar = () => {}, ehRecorte = false) => {
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
      if (!caixa) { diagnosticar('Coordenadas ausentes ou fora da foto'); return 'invalido'; }
      const x = Math.floor(caixa.left);
      const y = Math.floor(caixa.top);
      const w = Math.ceil(caixa.right) - x;
      const h = Math.ceil(caixa.bottom) - y;
      if (x < 0 || y < 0 || w <= 0 || h <= 0 ||
          x + w > canvas.width || y + h > canvas.height) {
        diagnosticar('Coordenadas fora da foto');
        return 'invalido';
      }
      // Amostras das duas metades evitam aceitar uma caixa preto/vermelho mista.
      if (w < 2) return 'invalido';
      const metade = Math.floor(w / 2);
      const a = classificarCorDigito(ctx.getImageData(x, y, metade, h).data);
      const b = classificarCorDigito(ctx.getImageData(x + metade, y, w - metade, h).data);
      if (!a || !b || a !== b) diagnosticar(`Caixa ${x},${y} ${w}×${h}: ${a || '?'} / ${b || '?'}`);
      if (a && b && a !== b) return 'misto';
      return a === b ? a : null;
    }, diagnosticar, ehRecorte);
  } finally {
    canvas.width = canvas.height = 0;
  }
};
