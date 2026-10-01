import test from 'node:test';
import assert from 'node:assert/strict';
import { caixaAmostraVisor, classificarCorDigito, interpretarVisor } from '../src/utils/ocrVisor.js';
import { aplicarMascaraLeitura } from '../src/utils/leituraNumerica.js';

const linha = (grupos) => ({ text: grupos.map(g => g.text).join(' '), elements: grupos });
const ler = (linhas) => interpretarVisor([{ lines: linhas }], e => e.cor);
test('visor sem vírgula: pretos e vermelhos respeitam a máscara existente', () => {
  const valor = ler([linha([{ text: '0540', cor: 'preto' }, { text: '77', cor: 'vermelho' }])]);
  assert.equal(valor, '0540,77');
  assert.equal(aplicarMascaraLeitura(valor), '540,7700');
});
test('placa e serial pretos não disputam com um visor preto/vermelho', () => {
  assert.equal(ler([
    { text: 'APTO 408', elements: [] },
    linha([{ text: '123456789', cor: 'preto' }]),
    linha([{ text: '00459', cor: 'preto' }, { text: '0320', cor: 'vermelho' }]),
  ]), '00459,0320');
});
test('não presume decimais em grupo único, cor indefinida ou ordem invertida', () => {
  for (const grupos of [
    [{ text: '054077', cor: 'preto' }],
    [{ text: '0540', cor: 'preto' }, { text: '77', cor: null }],
    [{ text: '77', cor: 'vermelho' }, { text: '0540', cor: 'preto' }],
    [{ text: '0540', cor: 'preto' }, { text: '7', cor: 'vermelho' }, { text: '7', cor: 'preto' }],
    [{ text: '05O0', cor: 'preto' }, { text: '77', cor: 'vermelho' }],
  ]) assert.equal(ler([linha(grupos)]), null);
});
test('dois visores candidatos não são selecionados arbitrariamente', () => {
  const l = linha([{ text: '0540', cor: 'preto' }, { text: '77', cor: 'vermelho' }]);
  assert.equal(ler([l, l]), null);
});
test('classifica pixels com tinta suficiente e recusa reflexo branco', () => {
  assert.equal(classificarCorDigito(new Uint8ClampedArray([180, 40, 40, 255])), 'vermelho');
  assert.equal(classificarCorDigito(new Uint8ClampedArray([40, 40, 40, 255])), 'preto');
  assert.equal(classificarCorDigito(new Uint8ClampedArray([255, 255, 255, 255])), null);
  assert.equal(classificarCorDigito(new Uint8ClampedArray()), null);
});

test('amostra inclui fundo do rolete além da caixa dos traços', () => {
  assert.deepEqual(caixaAmostraVisor({left:20,top:20,right:40,bottom:60},100,100),
    {left:18,top:14,right:42,bottom:66});
  assert.deepEqual(caixaAmostraVisor({left:0,top:0,right:20,bottom:40},20,40),
    {left:0,top:0,right:20,bottom:40});
  assert.equal(caixaAmostraVisor({left:20,top:20,right:200,bottom:60},100,100),null);
  assert.equal(caixaAmostraVisor({left:NaN,top:20,right:40,bottom:60},100,100),null);
});

test('dígitos brancos em rolete preto ainda pertencem à parte inteira', () => {
  const pixels = new Uint8ClampedArray([255,255,255,255, 20,20,20,255]);
  assert.equal(classificarCorDigito(pixels), 'preto');
  const grupos = ['00','0','3','5','8','5','9'].map((text,i) => ({text,cor:i<4 ? 'preto':'vermelho'}));
  assert.equal(ler([linha(grupos)]), '00035,859');
});

test('diagnóstico classifica todos os elementos mesmo quando o primeiro é indefinido', () => {
  const cores = [];
  const grupos = [{text:'00035',cor:null},{text:'859',cor:'vermelho'}];
  assert.equal(interpretarVisor([{lines:[linha(grupos)]}], e => {cores.push(e.text);return e.cor;}),null);
  assert.deepEqual(cores,['00035','859']);
});
