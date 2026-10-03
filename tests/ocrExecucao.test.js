import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarMascaraLeitura } from '../src/utils/leituraNumerica.js';

// Ponte nativa simulada: exercita os proxies reais do Capacitor e a limpeza.
// Não simula a precisão do ML Kit. Os pixels sintéticos exercitam cor e recorte.
let estado;
globalThis.androidBridge = {};
globalThis.Capacitor = {
  PluginHeaders: [
    { name: 'Filesystem', methods: ['writeFile', 'deleteFile'].map(name => ({ name, rtype: 'promise' })) },
    { name: 'TextRecognition', methods: [{ name: 'processImage', rtype: 'promise' }] },
  ],
  nativePromise: async (plugin, metodo, opcoes) => {
    if (plugin === 'Filesystem' && metodo === 'writeFile') {
      estado.escritas.push(opcoes);
      estado.aoEscrever?.(estado.escritas.length);
      return { uri: `file:///cache/${opcoes.path}` };
    }
    if (plugin === 'Filesystem' && metodo === 'deleteFile') {
      estado.excluidos.push(opcoes.path);
      estado.aoExcluir?.();
      return {};
    }
    if (plugin === 'TextRecognition' && metodo === 'processImage') {
      estado.chamadas.push(opcoes.path);
      const resposta = estado.respostas[estado.chamadas.length - 1];
      if (resposta instanceof Error) throw resposta;
      estado.aoReconhecer?.(estado.chamadas.length);
      return resposta;
    }
    throw new Error('Chamada nativa inesperada');
  },
};
const { executarOcr } = await import('../src/utils/ocrService.js');
const { criarImagemTemporariaOcr } = await import('../src/utils/ocrEnquadramento.js');
const parcial = { text: '00017', blocks: [{ lines: [{ text: '00017',
  boundingBox: { left: 100, top: 40, right: 300, bottom: 80 },
  elements: [{ text: '00017', boundingBox: { left: 100, top: 40, right: 300, bottom: 80 } }],
}] }] };

function preparar(t) {
  estado = { escritas: [], excluidos: [], chamadas: [], respostas: [parcial, { text: '00017,440', blocks: [] }] };
  const documentAnterior = globalThis.document;
  const imageAnterior = globalThis.Image;
  globalThis.Image = class {
    naturalWidth = estado.largura || 720;
    naturalHeight = estado.altura || 1280;
    async decode() {}
  };
  globalThis.document = { createElement: () => ({ width: 1, height: 1,
    toDataURL: () => 'data:image/jpeg;base64,eA==',
    getContext: () => {
      let deslocamentoX = 0;
      return {
        drawImage(...args) { deslocamentoX = args.length === 9 ? args[1] - args[5] : 0; },
        putImageData() {},
        getImageData(x, y, w, h) {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < w * h; i++) {
            const p = i * 4;
            const posicao = deslocamentoX + x + i % w;
            const cor = estado.corPixel?.(posicao, y + Math.floor(i / w)) || (posicao >= 300 ? [180, 50, 50] : [30, 30, 30]);
            data[p] = cor[0];
            data[p + 1] = cor[1];
            data[p + 2] = cor[2];
            data[p + 3] = 255;
          }
          return { data };
        },
      };
    },
  }) };
  t.after(() => {
    if (documentAnterior === undefined) delete globalThis.document;
    else globalThis.document = documentAnterior;
    if (imageAnterior === undefined) delete globalThis.Image;
    else globalThis.Image = imageAnterior;
  });
  return estado;
}

// Geometria da caixa ampliada do diagnóstico D15 (285,30,38×58),
// com números e pixels sintéticos. A moldura não pertence ao dígito.
const respostaBordaVisor = () => {
  const digitos = [...'00045678'].map((text, i) => ({ text,
    boundingBox: { left: 80 + i * 52, top: 37, right: 112 + i * 52, bottom: 81 },
  }));
  const elements = [digitos.slice(0, 3), digitos.slice(3, 5), digitos.slice(5, 7), digitos.slice(7)]
    .map(symbols => ({ text: symbols.map(s => s.text).join(''), symbols }));
  const l = { text: elements.map(e => e.text).join(' '), elements };
  return { text: l.text, blocks: [{ lines: [l] }] };
};

const reconhecerBorda = async (t, corPixel) => {
  const e = preparar(t);
  e.largura = 540; e.altura = 109;
  e.corPixel = corPixel;
  e.respostas = [respostaBordaVisor(), { text: '', blocks: [] }];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 5, decimais: 3 });
  const r = await executarOcr(imagem, {});
  assert.equal(imagem.ler(), null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
  return { r, e };
};

const respostaSemUltimoDigito = () => {
  const r = respostaBordaVisor();
  const l = r.blocks[0].lines[0];
  l.elements.pop();
  r.text = l.text = l.elements.map(e => e.text).join(' ');
  return r;
};

test('visor de oito dígitos: resultado com sete exige nova tentativa antes de preencher', async t => {
  const e = preparar(t);
  e.largura = 540; e.altura = 109;
  e.corPixel = x => x >= 320 ? [180, 50, 50] : [30, 30, 30];
  e.respostas = [respostaSemUltimoDigito(), respostaBordaVisor()];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 5, decimais: 3 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, '00045,678');
  assert.equal(e.chamadas.length, 2);
  assert.equal(imagem.ler(), null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('duas omissões iguais não confirmam uma leitura incompleta', async t => {
  const e = preparar(t);
  e.largura = 540; e.altura = 109;
  e.corPixel = x => x >= 320 ? [180, 50, 50] : [30, 30, 30];
  e.respostas = [respostaSemUltimoDigito(), respostaSemUltimoDigito()];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 5, decimais: 3 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.equal(imagem.ler(), null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('borda vermelha fora da caixa do último inteiro não desloca a vírgula', async t => {
  const { r, e } = await reconhecerBorda(t, x => x >= 320 ? [180, 50, 50] : [30, 30, 30]);
  assert.equal(r.valor, '00045,678');
  assert.equal(e.chamadas.length, 1);
});

test('moldura vermelha acima do dígito não transforma inteiro em decimal', async t => {
  const { r, e } = await reconhecerBorda(t, (x, y) => x >= 330 || (x >= 285 && y < 37)
    ? [180, 50, 50] : [30, 30, 30]);
  assert.equal(r.valor, '00045,678');
  assert.equal(e.chamadas.length, 1);
});

test('divisão preta/vermelha dentro da caixa do dígito continua ambígua', async t => {
  const { r, e } = await reconhecerBorda(t, x => x >= 304 ? [180, 50, 50] : [30, 30, 30]);
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
});

test('dígito branco usa margem uniforme preta quando sua caixa não contém fundo', async t => {
  const { r, e } = await reconhecerBorda(t, (x, y) =>
    x >= 288 && x < 320 && y >= 37 && y < 81 ? [255, 255, 255]
      : x >= 330 ? [180, 50, 50] : [30, 30, 30]);
  assert.equal(r.valor, '00045,678');
  assert.equal(e.chamadas.length, 1);
});

test('caixa branca com margem mista não recebe cor pelo vizinho', async t => {
  const { r } = await reconhecerBorda(t, (x, y) =>
    x >= 288 && x < 320 && y >= 37 && y < 81 ? [255, 255, 255]
      : x >= 320 ? [180, 50, 50] : [30, 30, 30]);
  assert.equal(r.valor, null);
});

test('margem vermelha não substitui metade preta confirmada dentro da caixa', async t => {
  const { r } = await reconhecerBorda(t, (x, y) => {
    if (x >= 288 && x < 320 && y >= 37 && y < 81) return x < 304 ? [30, 30, 30] : [255, 255, 255];
    return x >= 330 || (x >= 285 && y < 37) ? [180, 50, 50] : [30, 30, 30];
  });
  assert.equal(r.valor, null);
});

for (const enquadrada of [true, false]) {
  test(`captura ${enquadrada ? 'com guia' : 'da galeria'} sem padrão não chama o motor nem sugere leitura parcial`, async t => {
    const e = preparar(t);
    const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', enquadrada);
    const r = await executarOcr(imagem, {});
    assert.equal(r.valor, null);
    assert.match(r.erro, /Confirme o padrão/);
    assert.equal(e.chamadas.length, 0);
    assert.equal(e.escritas.length, 0);
    assert.equal(imagem.ler(), null);
  });
}

test('separador explícito não permite completar uma casa física que o motor omitiu', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '459,032', blocks: [] }, { text: '459,0320', blocks: [] }];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 3, decimais: 4 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, '459,0320');
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('mesmo total com separação decimal diferente do visor continua recusado', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '0045,6780', blocks: [] }, { text: '0045,6780', blocks: [] }];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 5, decimais: 3 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('visor confirmado sem decimais reconhece inteiro sem mudar a máscara do app', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '00123 kWh', blocks: [] }];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 5, decimais: 0 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, '00123,0');
  assert.equal(aplicarMascaraLeitura(r.valor), '123,0000');
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('quantidade não converte letras parecidas com números', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '9o9 28133-m', blocks: [] }, { text: '9o9 2933-m', blocks: [] }];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 5, decimais: 3 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('visor sem decimais não aproveita unidades anexadas ou rótulos como números', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '00123kWh', blocks: [] }, { text: 'Serial 00123', blocks: [] }];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 5, decimais: 0 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('guia reconhece sua faixa e libera a imagem sem enviar a foto completa ao motor', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '459,0320', blocks: [] }];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,cmVjb3J0ZQ==', true, null, { inteiros: 3, decimais: 4 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, '459,0320');
  assert.equal(e.escritas[0].data, 'cmVjb3J0ZQ==');
  assert.equal(e.chamadas.length, 1);
  assert.equal(imagem.ler(), null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('guia permite contraste mesmo se a primeira passagem não encontrar nenhum texto', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '', blocks: [] }, { text: '459,0320', blocks: [] }];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 3, decimais: 4 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, '459,0320');
  assert.equal(e.chamadas.length, 2);
  assert.equal(imagem.ler(), null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('cancelar a faixa impede segunda passagem e limpa pixels e temporário', async t => {
  const e = preparar(t);
  let ativa = true;
  e.aoReconhecer = () => { ativa = false; };
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 3, decimais: 4 });
  await executarOcr(imagem, {}, () => {}, () => ativa);
  assert.equal(e.chamadas.length, 1);
  assert.equal(imagem.ler(), null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('falha nativa na faixa libera os arquivos e o recurso sem sugestão', async t => {
  const e = preparar(t);
  e.respostas = [new Error('erro no motor')];
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 3, decimais: 4 });
  const r = await executarOcr(imagem, {});
  assert.equal(r.valor, null); assert.equal(r.sucesso, false);
  assert.equal(imagem.ler(), null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('cancelar remove o temporário mesmo com reconhecimento nativo ainda pendente', async t => {
  const e = preparar(t);
  let entregar, iniciou, excluiu;
  const inicio = new Promise(r => { iniciou = r; });
  const limpeza = new Promise(r => { excluiu = r; });
  const pendente = new Promise(r => { entregar = r; });
  e.respostas = [pendente]; e.aoReconhecer = () => iniciou();
  e.aoExcluir = () => excluiu();
  let ativa = true;
  const imagem = criarImagemTemporariaOcr('data:image/jpeg;base64,eA==', true, null, { inteiros: 3, decimais: 4 });
  const tarefa = executarOcr(imagem, {}, () => {}, () => ativa);
  await inicio;
  ativa = false; imagem.liberar();
  try {
    assert.equal(imagem.ler(), null);
    await limpeza; // A exclusão nativa é assíncrona e independe do motor terminar.
    assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
  } finally {
    entregar({ text: '459,0320', blocks: [] });
  }
  const resultado = await tarefa;
  assert.equal(resultado.valor, null);
  assert.equal(e.excluidos.length, 1);
});

test('primeira resposta válida não inicia recorte e limpa seu temporário', async t => {
  const e = preparar(t);
  e.respostas = [{ text: '459,0320', blocks: [] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '459,0320');
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('recorte permite só uma chamada adicional e limpa os dois temporários', async t => {
  const e = preparar(t);
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00017,440');
  assert.equal(e.chamadas.length, 2);
  assert.equal(new Set(e.escritas.map(o => o.path)).size, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('falha no reconhecimento do recorte limpa tudo e não entrega sugestão', async t => {
  const e = preparar(t);
  e.respostas[1] = new Error('falha nativa');
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.sucesso, false);
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('cancelamento após primeira resposta impede iniciar a tentativa extra', async t => {
  const e = preparar(t);
  let ativa = true;
  e.aoReconhecer = () => { ativa = false; };
  await executarOcr('data:image/jpeg;base64,eA==', {}, () => {}, () => ativa);
  assert.equal(e.chamadas.length, 1);
  assert.equal(e.escritas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('cancelamento durante escrita do recorte limpa ambos sem outra chamada', async t => {
  const e = preparar(t);
  let ativa = true;
  e.aoEscrever = n => { if (n === 2) ativa = false; };
  await executarOcr('data:image/jpeg;base64,eA==', {}, () => {}, () => ativa);
  assert.equal(e.escritas.length, 2);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('segunda resposta incompleta termina sem repetir o reconhecimento', async t => {
  const e = preparar(t);
  e.respostas[1] = parcial;
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('duas faixas candidatas impedem escolher um recorte arbitrário', async t => {
  const e = preparar(t);
  e.respostas[0] = { ...parcial, blocks: [{ lines: [parcial.blocks[0].lines[0], parcial.blocks[0].lines[0]] }] };
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('escrita que falha após criar o recorte também solicita limpeza', async t => {
  const e = preparar(t);
  e.aoEscrever = n => { if (n === 2) throw new Error('escrita incompleta'); };
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.sucesso, false);
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(new Set(e.excluidos), new Set(e.escritas.map(o => o.path)));
});

const linhaMista = { text: '0001 74m', boundingBox: { left: 100, top: 40, right: 450, bottom: 80 },
  elements: [
    { text: '0001', boundingBox: { left: 100, top: 40, right: 280, bottom: 80 } },
    { text: '74m', boundingBox: { left: 280, top: 40, right: 450, bottom: 80 } },
  ],
};
test('regressão D5: trecho 0001 em linha 0001 74m habilita o recorte validado', async t => {
  const e = preparar(t);
  e.respostas[0] = { text: linhaMista.text, blocks: [{ lines: [linhaMista] }] };
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, '00017,440'); // Resposta simulada da segunda chamada.
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('trecho para localizar não preenche campo quando novo resultado contém letras', async t => {
  const e = preparar(t);
  e.respostas = [0, 1].map(() => ({ text: linhaMista.text, blocks: [{ lines: [linhaMista] }] }));
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
test('linha sem nenhum elemento puramente numérico não cria âncora artificial', async t => {
  const e = preparar(t);
  const elementos = linhaMista.elements.map(el => ({ ...el, text: 'O001m' }));
  e.respostas[0] = { text: 'O001m 74m', blocks: [{ lines: [{ ...linhaMista, text: 'O001m 74m', elements: elementos }] }] };
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 1);
  assert.equal(r.valor, null);
});

const respostaD6 = () => ({ text: '1021\n0003 5 85 9\n85 9m\n62100n3261D Au', blocks: [{ lines: [
    { text: '1021', elements: [{ text: '1021', boundingBox: { left: 20, top: 10, right: 80, bottom: 30 } }] },
    { text: '0003 5 85 9', elements: [
      { text: '0003', boundingBox: { left: 100, top: 40, right: 220, bottom: 80 } },
      { text: '5', boundingBox: { left: 226, top: 40, right: 256, bottom: 80 } },
      { text: '85', boundingBox: { left: 264, top: 40, right: 324, bottom: 80 } },
      { text: '9', boundingBox: { left: 330, top: 40, right: 360, bottom: 80 } },
    ] },
    { text: '85 9m', elements: [{ text: '85' }, { text: '9m' }] },
    { text: '62100n3261D Au', elements: [] },
  ] }] });

test('prefixo indefinido alinhado aproveita a primeira resposta e limpa seu único temporário', async t => {
  const e = preparar(t);
  e.corPixel = x => x < 223 ? [255, 255, 255] : x < 260 ? [30, 30, 30] : [180, 50, 50];
  e.respostas = [respostaD6()];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00035,859');
  assert.equal(r.sucesso, true);
  assert.equal(e.chamadas.length, 1);
  assert.equal(e.escritas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('caixa preta/vermelha mista não vira prefixo inteiro pela posição', async t => {
  const e = preparar(t);
  e.corPixel = x => (x >= 160 && x < 223) || x >= 260 ? [180, 50, 50] : [30, 30, 30];
  e.respostas = [respostaD6()];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('prefixo com caixa parcialmente fora da foto não recebe cor pela posição', async t => {
  const e = preparar(t);
  e.corPixel = x => x < 223 ? [255, 255, 255] : x < 260 ? [30, 30, 30] : [180, 50, 50];
  const resposta = respostaD6();
  for (const [i, elemento] of resposta.blocks[0].lines[1].elements.entries()) {
    elemento.boundingBox.top = 1230;
    elemento.boundingBox.bottom = i === 0 ? 1290 : 1270; // Foto com 1280 px de altura.
  }
  e.respostas = [resposta];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('regressão D7: linha 0035 859 m interpreta as cores antes de decidir pelo recorte', async t => {
  const e = preparar(t);
  e.respostas = [{ text: 'M02\n0035 859 m\n821R50832610 A', blocks: [{ lines: [
    { text: 'M02', elements: [{ text: 'M02' }] },
    { text: '0035 859 m', elements: [
      { text: '0035', boundingBox: { left: 100, top: 40, right: 280, bottom: 80 } },
      { text: '859', boundingBox: { left: 310, top: 40, right: 450, bottom: 80 } },
      { text: 'm' },
    ] },
    { text: '821R50832610 A', elements: [] },
  ] }] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '0035,859');
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

const respostaD8 = () => {
  const visor = { ...parcial.blocks[0].lines[0], text: '0001?4',
    elements: [{ ...parcial.blocks[0].lines[0].elements[0], text: '0001?4' }] };
  return { text: '101\n0001?4\nB21A9003125D An 01', blocks: [{ lines: [
    { text: '101', elements: [{ text: '101' }] },
    visor,
    { text: 'B21A9003125D An 01', elements: [{ text: 'B21A9003125D' }, { text: 'An' }, { text: '01' }] },
  ] }] };
};

test('regressão D8: caixa 0001?4 permite uma tentativa com contraste e limpa ambos os temporários', async t => {
  const e = preparar(t);
  e.respostas[0] = respostaD8();
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, '00017,440'); // Somente a resposta simulada da segunda chamada.
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('segunda resposta com dúvida não preenche e não inicia uma terceira tentativa', async t => {
  const e = preparar(t);
  e.respostas = [respostaD8(), respostaD8()];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('caixa com dúvida sem evidência vermelha não habilita recorte', async t => {
  const e = preparar(t);
  e.respostas = [respostaD8()];
  e.corPixel = () => [30, 30, 30];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 1);
  assert.equal(r.valor, null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

const respostaD10_101 = () => {
  const visor = structuredClone(parcial.blocks[0].lines[0]);
  visor.text = visor.elements[0].text = '0001742i';
  return { text: '101\n0001742i', blocks: [{ lines: [
    { text: '101', elements: [{ text: '101' }] }, visor,
  ] }] };
};

test('regressão D10 APTO-101: letra final permite recorte sem converter a primeira resposta', async t => {
  const e = preparar(t);
  e.respostas = [respostaD10_101(), { text: '', blocks: [] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, null);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('letra final que persiste após o recorte termina sem valor e sem terceira chamada', async t => {
  const e = preparar(t);
  e.respostas = [respostaD10_101(), respostaD10_101()];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

// Texto, caixa da linha e duas amostras observados no D10. As demais caixas
// e os pixels são fixtures; não reproduzem a precisão nativa ou a fotografia.
const respostaD10_102 = () => ({ text: '003 5 8 5 9', blocks: [{ lines: [{
  text: '003 5 8 5 9', boundingBox: { left: 436, top: 1569, right: 1873, bottom: 1779 },
  elements: [
    { text: '003', boundingBox: { left: 436, top: 1570, right: 946, bottom: 1739 } },
    { text: '5', boundingBox: { left: 1076, top: 1597, right: 1166, bottom: 1748 } },
    { text: '8', boundingBox: { left: 1310, top: 1585, right: 1425, bottom: 1760 } },
    { text: '5', boundingBox: { left: 1530, top: 1585, right: 1645, bottom: 1760 } },
    { text: '9', boundingBox: { left: 1758, top: 1585, right: 1869, bottom: 1779 } },
  ],
}] }] });

test('regressão D10 APTO-102: prefixo neutro e fronteira indefinida habilitam somente o recorte', async t => {
  const e = preparar(t);
  e.largura = 2304;
  e.altura = 4096;
  e.corPixel = x => x >= 1270 || (x >= 1069 && x < 1121) ? [180, 50, 50] : [255, 255, 255];
  e.respostas = [respostaD10_102(), { text: '', blocks: [] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(e.chamadas.length, 2);
  assert.equal(r.valor, null); // A posição não confirma que o primeiro 5 é inteiro.
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('prefixo neutro sem região vermelha continua sem recorte ou sugestão', async t => {
  const e = preparar(t);
  e.corPixel = () => [255, 255, 255];
  e.respostas = [parcial];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('prefixo neutro sem zero inicial não ganha recorte apenas por um vizinho vermelho', async t => {
  const e = preparar(t);
  e.corPixel = x => x >= 300 ? [180, 50, 50] : [255, 255, 255];
  const resposta = structuredClone(parcial);
  resposta.text = resposta.blocks[0].lines[0].text = resposta.blocks[0].lines[0].elements[0].text = '12345';
  e.respostas = [resposta];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
});

test('dois prefixos neutros candidatos não são selecionados arbitrariamente', async t => {
  const e = preparar(t);
  e.corPixel = x => x >= 300 ? [180, 50, 50] : [255, 255, 255];
  e.respostas = [{ text: parcial.text, blocks: [{ lines: [parcial.blocks[0].lines[0], parcial.blocks[0].lines[0]] }] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 1);
});

// Contrato adicional do patch nativo D12. Todas as caixas e cores são sintéticas.
const simboloD12 = (text, x, top = 40, bottom = 80) => ({ text, confidence: 0.95,
  boundingBox: { left: x, top, right: x + 25, bottom } });
const grupoD12 = symbols => ({ text: symbols.map(s => s.text).join(''), symbols,
  boundingBox: { left: Math.min(...symbols.map(s => s.boundingBox.left)),
    top: Math.min(...symbols.map(s => s.boundingBox.top)),
    right: Math.max(...symbols.map(s => s.boundingBox.right)),
    bottom: Math.max(...symbols.map(s => s.boundingBox.bottom)) } });
const linhaD12 = elements => ({ text: elements.map(e => e.text).join(' '), elements });

test('ponte D12: grupo 7450 misto separa o 7 preto sem nova chamada ao motor', async t => {
  const e = preparar(t);
  const grupos = [grupoD12([...'0001'].map((d, i) => simboloD12(d, 100 + i * 40))),
    grupoD12([simboloD12('7', 260), simboloD12('4', 320), simboloD12('5', 370), simboloD12('0', 420)])];
  const l = linhaD12(grupos);
  e.respostas = [{ text: l.text, blocks: [{ lines: [l] }] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00017,450');
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('ponte D12: transição reconhecida de 3 para 4 usa pixels da mesma coluna', async t => {
  const e = preparar(t);
  const l = linhaD12([grupoD12([...'00017'].map((d, i) => simboloD12(d, 100 + i * 40))),
    grupoD12([simboloD12('3', 320, 40, 60), simboloD12('5', 370), simboloD12('0', 420)])]);
  const outra = linhaD12([grupoD12([simboloD12('4', 320, 61, 81)])]);
  e.respostas = [{ text: l.text + '\n' + outra.text, blocks: [{ lines: [l, outra] }] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00017,450');
  assert.equal(e.chamadas.length, 1);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('ponte D12: símbolos vazios exigem novo reconhecimento, sem aproveitar a palavra', async t => {
  const e = preparar(t);
  const l = linhaD12([grupoD12([...'00017'].map((d, i) => simboloD12(d, 100 + i * 40))),
    grupoD12([simboloD12('4', 320), simboloD12('5', 370), simboloD12('0', 420)])]);
  l.elements[1].symbols = [];
  e.respostas = [{ text: l.text, blocks: [{ lines: [l] }] }, { text: '', blocks: [] }];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

// Textos do D12 APTO-103; caixas e pixels sintéticos, não a foto nem o motor.
const resposta103 = completa => {
  const digitos = [...'00072933'].map((d, i) => simboloD12(d, i < 5 ? 100 + i * 40 : 320 + (i - 5) * 40));
  if (!completa) digitos.splice(6, 1);
  const m = simboloD12('m', 490);
  const elements = completa ? [grupoD12(digitos.slice(0, 4)), grupoD12([...digitos.slice(4), m])]
    : [grupoD12([...digitos, m])];
  const l = linhaD12(elements);
  return { text: l.text, blocks: [{ lines: [l] }] };
};

test('ponte D13 APTO-103: foto 0007293m exige recorte; 0007 2933m preserva todos os decimais', async t => {
  const e = preparar(t);
  e.corPixel = x => x < 300 || x >= 470 ? [30, 30, 30] : [180, 50, 50];
  e.respostas = [resposta103(false), resposta103(true)];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00072,933');
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('ponte D13: unidade válida na foto inteira também precisa da confirmação no recorte', async t => {
  const e = preparar(t);
  e.corPixel = x => x < 300 || x >= 470 ? [30, 30, 30] : [180, 50, 50];
  e.respostas = [resposta103(true), resposta103(true)];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00072,933');
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('ponte D13: unidade sem símbolos confiáveis após recorte termina sem valor e sem terceira chamada', async t => {
  const e = preparar(t);
  e.corPixel = x => x < 300 || x >= 470 ? [30, 30, 30] : [180, 50, 50];
  const segunda = resposta103(true);
  segunda.blocks[0].lines[0].elements[1].symbols.at(-1).confidence = 0.8;
  e.respostas = [resposta103(false), segunda];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('ponte D13: caixa da unidade fora da imagem não valida os dígitos internos', async t => {
  const e = preparar(t);
  e.corPixel = x => (e.chamadas.length < 2 ? x >= 300 && x < 470 : x >= 550 && x < 720)
    ? [180, 50, 50] : [30, 30, 30];
  const segunda = resposta103(true);
  const l = segunda.blocks[0].lines[0];
  l.elements = l.elements.map(g => grupoD12(g.symbols.map(s => ({ ...s,
    boundingBox: { ...s.boundingBox, left: s.boundingBox.left + 250, right: s.boundingBox.right + 250 },
  }))));
  e.respostas = [resposta103(false), segunda];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

// Texto observado no D13; caixas e pixels seguem sendo fixtures sintéticas.
const resposta103SemUnidade = (traco = false) => {
  const r = resposta103(true);
  const l = r.blocks[0].lines[0];
  l.elements[1] = grupoD12(l.elements[1].symbols.slice(0, -1));
  l.text = l.elements.map(g => g.text).join(' ') + (traco ? '-' : '');
  r.text = l.text;
  return r;
};
const cores103 = e => x => (e.chamadas.length < 2 ? x < 300 ? [255, 255, 255] : [180, 50, 50]
  : x < 300 ? [30, 30, 30] : [180, 50, 50]);

test('ponte D14 APTO-103: recorte 0007 2933- com símbolos numéricos mantém a leitura e limpa os temporários', async t => {
  const e = preparar(t);
  e.corPixel = cores103(e);
  e.respostas = [resposta103SemUnidade(), resposta103SemUnidade(true)];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, '00072,933');
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('ponte D14: traço presente no elemento do recorte continua sem sugestão ou terceira chamada', async t => {
  const e = preparar(t);
  e.corPixel = cores103(e);
  const segunda = resposta103SemUnidade(true);
  const l = segunda.blocks[0].lines[0];
  l.elements[1] = grupoD12([...l.elements[1].symbols, simboloD12('-', 460)]);
  e.respostas = [resposta103SemUnidade(), segunda];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});

test('ponte D14: retirar traço agregado não confirma uma fronteira decimal indefinida', async t => {
  const e = preparar(t);
  const cor = cores103(e);
  e.corPixel = x => e.chamadas.length === 2 && x >= 250 && x < 300 ? [255, 255, 255] : cor(x);
  e.respostas = [resposta103SemUnidade(), resposta103SemUnidade(true)];
  const r = await executarOcr('data:image/jpeg;base64,eA==', {});
  assert.equal(r.valor, null);
  assert.equal(e.chamadas.length, 2);
  assert.deepEqual(e.excluidos, e.escritas.map(o => o.path));
});
