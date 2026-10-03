// Usa somente caracteres e caixas que o motor reconheceu. Não divide uma
// palavra em espaços estimados nem completa os dígitos que faltam na foto.
const caixaValida = c => c && [c.left, c.top, c.right, c.bottom].every(Number.isFinite) &&
  c.left >= 0 && c.top >= 0 && c.right - c.left >= 2 && c.bottom - c.top >= 2;

const descreverCaixa = c => c ? `${c.left},${c.top},${c.right},${c.bottom}` : 'ausente';

const simbolosDoElemento = (elemento, aoRecusar = () => {}) => {
  const simbolos = elemento?.symbols;
  if (!Array.isArray(simbolos) || !simbolos.length) { aoRecusar('símbolos ausentes ou vazios'); return null; }
  if (simbolos.map(s => s?.text || '').join('') !== elemento.text) {
    aoRecusar('texto dos símbolos diferente do grupo'); return null;
  }
  if (simbolos.some(s => typeof s?.text !== 'string' || s.text.length !== 1 || !caixaValida(s.boundingBox))) {
    aoRecusar('caractere ou caixa individual inválida'); return null;
  }
  if (elemento.boundingBox && (!caixaValida(elemento.boundingBox) || simbolos.some(s => {
    const c = s.boundingBox;
    const p = elemento.boundingBox;
    return c.left < p.left - 2 || c.top < p.top - 2 || c.right > p.right + 2 || c.bottom > p.bottom + 2;
  }))) { aoRecusar('caixa individual fora do grupo ou caixa do grupo inválida'); return null; }
  return simbolos;
};

export const expandirSimbolosVisor = elementos => {
  if (!elementos.some(e => Object.hasOwn(e, 'symbols'))) return { elementos, individuais: false };
  const digitos = [];
  for (const elemento of elementos) {
    const simbolos = simbolosDoElemento(elemento);
    if (!simbolos || simbolos.some(s => !/^\d$/.test(s.text))) return null;
    digitos.push(...simbolos);
  }
  return { elementos: digitos, individuais: true };
};

// Uma unidade anexada no texto só é removida quando o motor entregou todos
// os caracteres e a caixa da letra está separada à direita do último dígito.
export const separarUnidadeSimbolos = (elemento, diagnosticar) => {
  const recusar = motivo => {
    if (!diagnosticar) return;
    diagnosticar(`Unidade recusada: ${motivo}`);
    const simbolos = elemento?.symbols;
    diagnosticar(`Grupo anexado ${elemento?.text}: caixa ${descreverCaixa(elemento?.boundingBox)}; símbolos ${Array.isArray(simbolos) ? simbolos.map(s => s?.text || '?').join('') : 'ausentes'}`);
    if (Array.isArray(simbolos)) for (const s of simbolos.slice(-4)) {
      diagnosticar(`Símbolo ${s?.text || '?'}: caixa ${descreverCaixa(s?.boundingBox)}; escore ${s?.confidence ?? 'ausente'}`);
    }
  };
  const partes = elemento?.text?.match(/^(\d+)(m(?:3|³)?|kWh)$/i);
  const simbolos = partes && simbolosDoElemento(elemento, recusar);
  if (!simbolos) return null;
  const digitos = simbolos.slice(0, partes[1].length);
  const unidade = simbolos.slice(partes[1].length);
  const ultimo = digitos.at(-1).boundingBox;
  const letra = unidade[0].boundingBox;
  const altura = ultimo.bottom - ultimo.top;
  const intervalo = letra.left - Math.max(...digitos.map(s => s.boundingBox.right));
  const sobreposicao = Math.min(ultimo.bottom, letra.bottom) - Math.max(ultimo.top, letra.top);
  const minimoIntervalo = Math.max(2, (ultimo.right - ultimo.left) * 0.25);
  if (intervalo < minimoIntervalo || intervalo > altura * 3) {
    recusar(`intervalo entre dígito e unidade ${intervalo}; permitido ${minimoIntervalo} a ${altura * 3}`); return null;
  }
  const minimoSobreposicao = Math.min(altura, letra.bottom - letra.top) * 0.5;
  if (sobreposicao < minimoSobreposicao) {
    recusar(`alinhamento vertical ${sobreposicao}; mínimo ${minimoSobreposicao}`); return null;
  }
  if (unidade.some(s => !Number.isFinite(s.confidence) || s.confidence < 0.85 || s.confidence > 1)) {
    recusar('escore da unidade ausente ou fora do intervalo 0.85 a 1'); return null;
  }
  if (unidade.some((s, i) => i && (s.boundingBox.left <= unidade[i - 1].boundingBox.left ||
      s.boundingBox.right <= unidade[i - 1].boundingBox.right ||
      s.boundingBox.left - unidade[i - 1].boundingBox.right > altura))) {
    recusar('ordem ou distância entre caracteres da unidade inválida'); return null;
  }
  return { unidade: partes[2], elemento: {
    text: partes[1], symbols: digitos,
    boundingBox: {
      left: Math.min(...digitos.map(s => s.boundingBox.left)),
      top: Math.min(...digitos.map(s => s.boundingBox.top)),
      right: Math.max(...digitos.map(s => s.boundingBox.right)),
      bottom: Math.max(...digitos.map(s => s.boundingBox.bottom)),
    },
  } };
};

// Duas caixas devem ocupar a mesma coluna e mostrar partes diferentes do
// rolete. Dígitos vizinhos na horizontal nunca constituem uma transição.
const mesmaColunaEmRotacao = (a, b) => {
  const ca = a.boundingBox;
  const cb = b.boundingBox;
  if (!caixaValida(ca) || !caixaValida(cb)) return false;
  const wa = ca.right - ca.left;
  const wb = cb.right - cb.left;
  const ha = ca.bottom - ca.top;
  const hb = cb.bottom - cb.top;
  const overlapX = Math.min(ca.right, cb.right) - Math.max(ca.left, cb.left);
  const overlapY = Math.min(ca.bottom, cb.bottom) - Math.max(ca.top, cb.top);
  const distanciaY = Math.abs((ca.top + ca.bottom - cb.top - cb.bottom) / 2);
  return Math.max(wa, wb) <= Math.min(wa, wb) * 1.8 &&
    Math.max(ha, hb) <= Math.min(ha, hb) * 2 &&
    overlapX >= Math.min(wa, wb) * 0.75 &&
    Math.abs((ca.left + ca.right - cb.left - cb.right) / 2) <= Math.max(wa, wb) * 0.2 &&
    overlapY <= Math.min(ha, hb) * 0.25 &&
    distanciaY >= Math.max(ha, hb) * 0.5 && distanciaY <= Math.max(ha, hb) * 1.5;
};

export const resolverTransicoesVisor = (elementos, outros, corElemento, diagnosticar = () => {}) => {
  const todos = [...elementos, ...outros];
  const usados = new Set();
  const resultado = [];
  for (const atual of elementos) {
    if (usados.has(atual)) continue;
    const parceiros = todos.filter(s => s !== atual && mesmaColunaEmRotacao(atual, s));
    if (!parceiros.length) { resultado.push(atual); continue; }
    const parceiro = parceiros[0];
    const cor = corElemento(atual);
    // 0,85 é um filtro conservador do escore nativo, não uma promessa de acerto.
    if (parceiros.length !== 1 || usados.has(parceiro) ||
        [atual, parceiro].some(s => !/^\d$/.test(s.text) || !Number.isFinite(s.confidence) ||
          s.confidence < 0.85 || s.confidence > 1) ||
        !['preto', 'vermelho'].includes(cor) || corElemento(parceiro) !== cor) {
      diagnosticar('Transição recusada: par visual ambíguo, cor ou escore insuficiente');
      return null;
    }
    const a = Number(atual.text);
    const b = Number(parceiro.text);
    const proximo = (a + 1) % 10 === b ? b : (b + 1) % 10 === a ? a : null;
    if (proximo == null) {
      diagnosticar('Transição recusada: os dois dígitos não são consecutivos');
      return null;
    }
    const ca = atual.boundingBox;
    const cb = parceiro.boundingBox;
    usados.add(atual);
    usados.add(parceiro);
    diagnosticar(`Transição visual: ${(proximo + 9) % 10} → ${proximo}`);
    resultado.push({ ...atual, text: String(proximo), boundingBox: {
      left: Math.min(ca.left, cb.left), top: Math.min(ca.top, cb.top),
      right: Math.max(ca.right, cb.right), bottom: Math.max(ca.bottom, cb.bottom),
    } });
  }
  if (resultado.some((s, i) => i && (s.boundingBox.left <= resultado[i - 1].boundingBox.left ||
      s.boundingBox.right <= resultado[i - 1].boundingBox.right))) {
    diagnosticar('Linha recusada: símbolos fora da ordem horizontal');
    return null;
  }
  const ultimo = resultado.at(-1);
  const c = ultimo?.boundingBox;
  if (c && corElemento(ultimo) === 'vermelho' && outros.some(s => {
    if (usados.has(s) || !caixaValida(s.boundingBox) || corElemento(s) !== 'vermelho') return false;
    const b = s.boundingBox;
    const h = c.bottom - c.top;
    return b.left >= c.right && b.left - c.right <= h * 2.5 &&
      b.bottom > c.top - h * 0.5 && b.top < c.bottom + h * 0.5;
  })) {
    diagnosticar('Linha recusada: outros dígitos vermelhos próximos da cauda; leitura incompleta');
    return null;
  }
  return resultado;
};
