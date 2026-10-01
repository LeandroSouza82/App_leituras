import test from 'node:test';
import assert from 'node:assert/strict';
import { caixaAmostraVisor, classificarCorDigito, interpretarVisor } from '../src/utils/ocrVisor.js';
import { aplicarMascaraLeitura, formatarLeitura4Casas, parseLeituraNumerica } from '../src/utils/leituraNumerica.js';

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

// Texto e cores observados no D6; as caixas abaixo são uma fixture de alinhamento.
const gruposD6 = () => [
  { text: '0003', cor: null, boundingBox: { left: 100, top: 100, right: 260, bottom: 180 } },
  { text: '5', cor: 'preto', boundingBox: { left: 266, top: 101, right: 306, bottom: 179 } },
  { text: '85', cor: 'vermelho', boundingBox: { left: 312, top: 100, right: 392, bottom: 180 } },
  { text: '9', cor: 'vermelho', boundingBox: { left: 398, top: 102, right: 438, bottom: 182 } },
];

test('regressão D6: prefixo indefinido alinhado antes do preto conserva os oito dígitos', () => {
  const diagnostico = [];
  const valor = interpretarVisor([{ lines: [linha(gruposD6())] }], e => e.cor, d => diagnostico.push(d));
  assert.equal(valor, '00035,859');
  assert.equal(aplicarMascaraLeitura(valor), '35,8590');
  assert.equal(formatarLeitura4Casas(parseLeituraNumerica(valor) - parseLeituraNumerica('35,5670')), '0,2920');
  assert.ok(diagnostico.includes('Prefixo inteiro confirmado pela posição antes do preto'));
});

test('posição também conserva grupo indefinido entre dois grupos inteiros pretos', () => {
  const grupos = gruposD6();
  grupos[0] = { text: '00', cor: 'preto', boundingBox: { left: 100, top: 100, right: 180, bottom: 180 } };
  grupos.splice(1, 0, { text: '03', cor: null, boundingBox: { left: 186, top: 100, right: 260, bottom: 180 } });
  assert.equal(ler([linha(grupos)]), '00035,859');
});

test('prefixo indefinido não entra sem caixas válidas para todos os grupos', () => {
  for (const indice of [0, 1, 2, 3]) {
    for (const caixa of [undefined, { left: NaN, top: 100, right: 260, bottom: 180 },
      { left: -10, top: 100, right: 260, bottom: 180 }, { left: 100, top: 100, right: 260, bottom: 100 }]) {
      const grupos = gruposD6();
      grupos[indice].boundingBox = caixa;
      assert.equal(ler([linha(grupos)]), null);
    }
  }
});

test('prefixo afastado, fora da linha, sobreposto ou em ordem invertida é recusado', () => {
  for (const caixa of [
    { left: 0, top: 100, right: 160, bottom: 180 }, // Afastado dos demais.
    { left: 100, top: 10, right: 260, bottom: 90 }, // Outra linha.
    { left: 100, top: 100, right: 300, bottom: 180 }, // Sobreposição excessiva.
    { left: 450, top: 100, right: 610, bottom: 180 }, // Ordem invertida.
    { left: 100, top: 10, right: 260, bottom: 200 }, // Altura incompatível.
  ]) {
    const grupos = gruposD6();
    grupos[0].boundingBox = caixa;
    assert.equal(ler([linha(grupos)]), null);
  }
});

test('cor indefinida na fronteira decimal ou na cauda continua sem sugestão', () => {
  for (const cores of [
    ['preto', null, 'vermelho', 'vermelho'],
    [null, null, 'vermelho', 'vermelho'],
    [null, 'preto', null, 'vermelho'],
    [null, 'preto', 'vermelho', null],
    [null, 'preto', 'vermelho', 'preto'],
    ['misto', 'preto', 'vermelho', 'vermelho'],
  ]) {
    const grupos = gruposD6().map((g, i) => ({ ...g, cor: cores[i] }));
    assert.equal(ler([linha(grupos)]), null);
  }
});

test('prefixo por posição exige correspondência integral entre texto e elementos', () => {
  const l = linha(gruposD6());
  l.text += ' 0';
  assert.equal(ler([l]), null);
  l.text = '0003 5 85 9m';
  assert.equal(ler([l]), null);
});

test('dois visores continuam ambíguos mesmo com prefixo validado por posição', () => {
  assert.equal(ler([linha(gruposD6()), linha([{ text: '00459', cor: 'preto' }, { text: '0320', cor: 'vermelho' }])]), null);
});
