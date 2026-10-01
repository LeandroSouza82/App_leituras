import test from 'node:test';
import assert from 'node:assert/strict';
import { expandirSimbolosVisor, resolverTransicoesVisor } from '../src/utils/ocrSimbolos.js';
import { interpretarVisor } from '../src/utils/ocrVisor.js';
import { aplicarMascaraLeitura } from '../src/utils/leituraNumerica.js';

// Caixas e escores sintéticos: verificam regras, não a precisão do motor nativo.
const simbolo = (text, x, cor, top = 100, bottom = 140) => ({ text, cor, confidence: 0.95,
  boundingBox: { left: x, top, right: x + 20, bottom } });
const grupo = symbols => ({ text: symbols.map(s => s.text).join(''), symbols,
  boundingBox: {
    left: Math.min(...symbols.map(s => s.boundingBox.left)),
    top: Math.min(...symbols.map(s => s.boundingBox.top)),
    right: Math.max(...symbols.map(s => s.boundingBox.right)),
    bottom: Math.max(...symbols.map(s => s.boundingBox.bottom)),
  } });
const linha = elements => ({ text: elements.map(e => e.text).join(' '), elements });
const prefixo = () => [...'00017'].map((d, i) => simbolo(d, 50 + i * 30, 'preto'));
const ler = (lines, logs = []) => interpretarVisor([{ lines }], s => s.cor, d => logs.push(d));
const visor = () => [...prefixo(), ...[...'350'].map((d, i) => simbolo(d, 200 + i * 30, 'vermelho'))];

test('grupo 74 usa as caixas reais de 7 preto e 4 vermelho, sem estimar largura', () => {
  const pretos = [...'0001'].map((d, i) => simbolo(d, 50 + i * 30, 'preto'));
  const misto = [simbolo('7', 170, 'preto'), simbolo('4', 200, 'vermelho')];
  const resto = [simbolo('5', 230, 'vermelho'), simbolo('0', 260, 'vermelho')];
  const logs = [];
  const valor = ler([linha([grupo(pretos), grupo(misto), grupo(resto)])], logs);
  assert.equal(aplicarMascaraLeitura(valor), '17,4500');
  assert.ok(logs.includes('7: preto'));
  assert.ok(logs.includes('4: vermelho'));
});

test('regressão APTO-102 com símbolos individuais mantém 35,8590', () => {
  const digitos = [...'00035859'].map((d, i) => simbolo(d, 50 + i * 30, i < 5 ? 'preto' : 'vermelho'));
  assert.equal(aplicarMascaraLeitura(ler([linha([grupo(digitos)])])), '35,8590');
});

test('dígito 3 sozinho permanece 3; não aplica mais um sem transição visual', () => {
  const digitos = visor();
  assert.equal(ler([linha([grupo(digitos)])]), '00017,350');
  assert.equal(digitos[5].text, '3');
});

test('3 e 4 reconhecidos na mesma coluna sugerem o próximo 4', () => {
  const digitos = visor();
  digitos[5].boundingBox.bottom = 125;
  const logs = [];
  const valor = ler([linha([grupo(digitos)]), linha([grupo([simbolo('4', 200, 'vermelho', 126, 151)])])], logs);
  assert.equal(valor, '00017,450');
  assert.ok(logs.includes('Transição visual: 3 → 4'));
  assert.equal(digitos[5].text, '3'); // A resposta original do motor permanece intacta.
});

test('regra de transição contempla todos os dez pares, incluindo 9 para 0', () => {
  for (let anterior = 0; anterior < 10; anterior++) {
    const proximo = (anterior + 1) % 10;
    for (const ordem of [[anterior, proximo], [proximo, anterior]]) {
      const a = simbolo(String(ordem[0]), 200, 'vermelho', 100, 125);
      const b = simbolo(String(ordem[1]), 200, 'vermelho', 126, 151);
      assert.equal(resolverTransicoesVisor([a], [b], s => s.cor)[0].text, String(proximo));
    }
  }
});

test('dois símbolos na mesma palavra e coluna representam um só rolete', () => {
  const digitos = visor();
  digitos[5].boundingBox.bottom = 125;
  digitos.splice(6, 0, simbolo('4', 200, 'vermelho', 126, 151));
  assert.equal(ler([linha([grupo(digitos)])]), '00017,450');
});

test('par não consecutivo, cor divergente, baixa confiança ou três candidatos são recusados', () => {
  const a = simbolo('3', 200, 'vermelho', 100, 125);
  const b = simbolo('4', 200, 'vermelho', 126, 151);
  for (const parceiros of [
    [{ ...b, text: '7' }], [{ ...b, cor: 'preto' }], [{ ...b, cor: null }],
    [{ ...b, confidence: 0.84 }], [{ ...b, confidence: undefined }],
    [{ ...b, confidence: NaN }], [{ ...b, confidence: 1.1 }], [b, { ...b, text: '5' }],
  ]) assert.equal(resolverTransicoesVisor([a], parceiros, s => s.cor), null);
});

test('dígitos vizinhos ou rótulos distantes não alteram 3 para 4', () => {
  const a = simbolo('3', 200, 'vermelho', 100, 125);
  // O vizinho vermelho em outra linha indica uma cauda incompleta.
  assert.equal(resolverTransicoesVisor([a], [simbolo('4', 230, 'vermelho', 126, 151)], s => s.cor), null);
  for (const b of [simbolo('4', 200, 'vermelho', 300, 325), simbolo('4', 200, 'vermelho', 100, 125)]) {
    assert.equal(resolverTransicoesVisor([a], [b], s => s.cor)[0].text, '3');
  }
});

test('caixas não são inventadas e payload parcial não volta à análise por grupo', () => {
  const g = grupo(prefixo());
  for (const invalido of [
    { ...g, symbols: [] }, { ...g, symbols: g.symbols.slice(0, -1) },
    { ...g, symbols: [{ ...g.symbols[0], text: 'O' }, ...g.symbols.slice(1)] },
    { ...g, symbols: [{ ...g.symbols[0], boundingBox: undefined }, ...g.symbols.slice(1)] },
    { ...g, symbols: [{ ...g.symbols[0], boundingBox: { left: NaN, top: 100, right: 70, bottom: 140 } }, ...g.symbols.slice(1)] },
    { ...g, boundingBox: { ...g.boundingBox, right: 100 } },
  ]) assert.equal(expandirSimbolosVisor([invalido]), null);
  assert.equal(expandirSimbolosVisor([g, { text: '450' }]), null);
  assert.equal(expandirSimbolosVisor([{ text: '00017' }, { text: '450' }]).individuais, false);
});

test('símbolos em ordem horizontal inválida não formam uma leitura', () => {
  const digitos = visor();
  [digitos[1].boundingBox, digitos[2].boundingBox] = [digitos[2].boundingBox, digitos[1].boundingBox];
  assert.equal(ler([linha([grupo(digitos)])]), null);
});

test('regressão APTO-101: cauda em outra linha impede apresentar uma leitura parcial', () => {
  const digitos = [...prefixo(), simbolo('4', 200, 'vermelho')];
  const extras = [simbolo('1', 230, 'vermelho', 126, 151), simbolo('4', 260, 'vermelho', 126, 151)];
  const logs = [];
  assert.equal(ler([linha([grupo(digitos)]), linha([grupo(extras)])], logs), null);
  assert.ok(logs.some(d => d.includes('leitura incompleta')));
});

test('unidade separada e dois visores mantêm as proteções existentes com símbolos', () => {
  const l = linha([grupo(visor()), { text: 'm³' }]);
  assert.equal(ler([l]), '00017,350');
  assert.equal(ler([l, l]), null);
});
