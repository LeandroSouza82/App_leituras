// Usa somente caracteres e caixas que o motor reconheceu. Não divide uma
// palavra em espaços estimados nem completa os dígitos que faltam na foto.
const caixaValida = c => c && [c.left, c.top, c.right, c.bottom].every(Number.isFinite) &&
  c.left >= 0 && c.top >= 0 && c.right - c.left >= 2 && c.bottom - c.top >= 2;

export const expandirSimbolosVisor = elementos => {
  if (!elementos.some(e => Object.hasOwn(e, 'symbols'))) return { elementos, individuais: false };
  const digitos = [];
  for (const elemento of elementos) {
    const simbolos = elemento.symbols;
    if (!Array.isArray(simbolos) || !simbolos.length ||
        simbolos.map(s => s?.text || '').join('') !== elemento.text ||
        simbolos.some(s => !/^\d$/.test(s.text) || !caixaValida(s.boundingBox))) return null;
    if (elemento.boundingBox && (!caixaValida(elemento.boundingBox) || simbolos.some(s => {
      const c = s.boundingBox;
      const p = elemento.boundingBox;
      return c.left < p.left - 2 || c.top < p.top - 2 || c.right > p.right + 2 || c.bottom > p.bottom + 2;
    }))) return null;
    digitos.push(...simbolos);
  }
  return { elementos: digitos, individuais: true };
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
