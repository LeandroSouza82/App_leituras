import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getViewportBounds,
  getDefaultPosition,
  calculateSnapPosition,
  isInsideTarget,
  isValidSavedPosition,
  classificarGesto,
  gerarAssinaturaDispensa,
  devePermanecerDispensada,
  setUcondoStatus,
  getUcondoStatus
} from '../src/utils/ucondoPillUtils.js';

test('getViewportBounds calcula limites considerando margens e safe area', () => {
  const bounds = getViewportBounds({
    windowWidth: 360,
    windowHeight: 640,
    pillWidth: 120,
    pillHeight: 36,
    safeAreaTop: 20,
    safeAreaBottom: 16
  });

  assert.equal(bounds.minX, 16);
  assert.equal(bounds.maxX, 360 - 120 - 16);
  assert.equal(bounds.minY, 28);
  assert.equal(bounds.maxY, 640 - 36 - (80 + 16));
});

test('getDefaultPosition posiciona no canto inferior direito', () => {
  const pos = getDefaultPosition({
    windowWidth: 412,
    windowHeight: 892,
    pillWidth: 140,
    pillHeight: 40,
    safeAreaBottom: 24
  });

  assert.equal(pos.x, 412 - 140 - 16);
  assert.equal(pos.y, 892 - 40 - (80 + 24));
});

test('calculateSnapPosition alinha à esquerda quando o centro estiver na metade esquerda', () => {
  const snapped = calculateSnapPosition({
    x: 40,
    y: 300,
    pillWidth: 100,
    pillHeight: 40,
    windowWidth: 360,
    windowHeight: 640
  });

  assert.equal(snapped.x, 16);
  assert.equal(snapped.y, 300);
});

test('calculateSnapPosition alinha à direita quando o centro estiver na metade direita', () => {
  const snapped = calculateSnapPosition({
    x: 200,
    y: 300,
    pillWidth: 100,
    pillHeight: 40,
    windowWidth: 360,
    windowHeight: 640
  });

  assert.equal(snapped.x, 244);
  assert.equal(snapped.y, 300);
});

test('calculateSnapPosition trava Y acima da barra de abas e abaixo da barra de status', () => {
  const topExceeded = calculateSnapPosition({
    x: 50,
    y: -50,
    pillWidth: 100,
    pillHeight: 40,
    windowWidth: 360,
    windowHeight: 640,
    safeAreaTop: 30
  });
  assert.equal(topExceeded.y, 38);

  const bottomExceeded = calculateSnapPosition({
    x: 50,
    y: 620,
    pillWidth: 100,
    pillHeight: 40,
    windowWidth: 360,
    windowHeight: 640,
    safeAreaBottom: 10
  });
  assert.equal(bottomExceeded.y, 640 - 40 - 90);
});

test('isInsideTarget detecta proximidade do alvo de descarte com margem', () => {
  const targetX = 180;
  const targetY = 550;
  const targetRadius = 26;
  const thresholdMargin = 48;

  assert.equal(
    isInsideTarget({
      pillX: 130,
      pillY: 530,
      pillWidth: 100,
      pillHeight: 40,
      targetX,
      targetY,
      targetRadius,
      thresholdMargin
    }),
    true
  );

  assert.equal(
    isInsideTarget({
      pillX: 130,
      pillY: 475,
      pillWidth: 100,
      pillHeight: 40,
      targetX,
      targetY,
      targetRadius,
      thresholdMargin
    }),
    true
  );

  assert.equal(
    isInsideTarget({
      pillX: 16,
      pillY: 200,
      pillWidth: 100,
      pillHeight: 40,
      targetX,
      targetY,
      targetRadius,
      thresholdMargin
    }),
    false
  );
});

test('isValidSavedPosition valida coordenadas dentro e fora da viewport', () => {
  const config = {
    windowWidth: 360,
    windowHeight: 640,
    pillWidth: 120,
    pillHeight: 40
  };

  assert.equal(isValidSavedPosition({ x: 16, y: 300 }, config), true);
  assert.equal(isValidSavedPosition({ x: 224, y: 500 }, config), true);
  assert.equal(isValidSavedPosition({ x: 500, y: 300 }, config), false);
  assert.equal(isValidSavedPosition({ x: -10, y: 300 }, config), false);
  assert.equal(isValidSavedPosition({ x: 16, y: 700 }, config), false);
  assert.equal(isValidSavedPosition(null, config), false);
  assert.equal(isValidSavedPosition({ x: NaN, y: 100 }, config), false);
});

test('classificarGesto identifica toque rápido com leve tremor', () => {
  assert.equal(
    classificarGesto({ distancia: 4, duracaoMs: 120, isHolding: false }),
    'toque'
  );
  assert.equal(
    classificarGesto({ distancia: 8, duracaoMs: 250, isHolding: false }),
    'toque'
  );
});

test('classificarGesto identifica arraste quando distância ultrapassa limite', () => {
  assert.equal(
    classificarGesto({ distancia: 15, duracaoMs: 150, isHolding: false }),
    'arraste'
  );
});

test('classificarGesto identifica segurar quando flag isHolding é verdadeira ou tempo >= limite', () => {
  assert.equal(
    classificarGesto({ distancia: 2, duracaoMs: 360, isHolding: false }),
    'segurar'
  );
  assert.equal(
    classificarGesto({ distancia: 0, duracaoMs: 200, isHolding: true }),
    'segurar'
  );
});

test('devePermanecerDispensada: sem mudança continua escondida', () => {
  const envios = [
    { id: 'envio-1', completo: true, falhou: false },
    { id: 'envio-2', completo: true, falhou: false }
  ];
  const assinaturaSalva = gerarAssinaturaDispensa({ envios, periodo: '2026-11' });

  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva,
      envios,
      periodoAtual: '2026-11',
      temErro: false,
      carregado: true
    }),
    true
  );
});

test('devePermanecerDispensada: lista vazia com carregado=false mantém a dispensa e não descarta', () => {
  const assinaturaSalva = {
    periodo: '2026-11',
    itens: [
      { id: 'envio-1', status: 'concluido' },
      { id: 'envio-2', status: 'concluido' }
    ]
  };

  // Na inicialização, envios = [] e carregado = false
  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva,
      envios: [],
      periodoAtual: '2026-11',
      temErro: false,
      carregado: false
    }),
    true
  );
});

test('devePermanecerDispensada: campos voláteis diferentes (percentual, etapas, timestamps) não afetam a assinatura', () => {
  const enviosOriginais = [
    { id: 'envio-1', completo: true, falhou: false, percentual: 100, etapa: 'Concluído', atualizadoEm: 1000 }
  ];
  const assinaturaSalva = gerarAssinaturaDispensa({ envios: enviosOriginais, periodo: '2026-11' });

  const enviosComCamposVolateis = [
    { id: 'envio-1', completo: true, falhou: false, percentual: 99, etapa: 'Finalizando', atualizadoEm: 9999 }
  ];

  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva,
      envios: enviosComCamposVolateis,
      periodoAtual: '2026-11',
      temErro: false,
      carregado: true
    }),
    true
  );
});

test('devePermanecerDispensada: envio novo reaparece', () => {
  const enviosSalvos = [{ id: 'envio-1', completo: true, falhou: false }];
  const assinaturaSalva = gerarAssinaturaDispensa({ envios: enviosSalvos, periodo: '2026-11' });

  const enviosAtuais = [
    { id: 'envio-1', completo: true, falhou: false },
    { id: 'envio-2', completo: true, falhou: false }
  ];

  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva,
      envios: enviosAtuais,
      periodoAtual: '2026-11',
      temErro: false
    }),
    false
  );
});

test('devePermanecerDispensada: envio ativo reaparece', () => {
  const envios = [
    { id: 'envio-1', completo: true, falhou: false },
    { id: 'envio-2', completo: false, falhou: false }
  ];
  const assinaturaSalva = {
    periodo: '2026-11',
    itens: [
      { id: 'envio-1', status: 'concluido' },
      { id: 'envio-2', status: 'ativo' }
    ]
  };

  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva,
      envios,
      periodoAtual: '2026-11',
      temErro: false
    }),
    false
  );
});

test('devePermanecerDispensada: erro geral ou em item reaparece', () => {
  const envios = [{ id: 'envio-1', completo: true, falhou: false }];
  const assinaturaSalva = gerarAssinaturaDispensa({ envios, periodo: '2026-11' });

  // Com temErro = true
  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva,
      envios,
      periodoAtual: '2026-11',
      temErro: true
    }),
    false
  );

  // Com item contendo falhou = true
  const enviosComFalha = [{ id: 'envio-1', completo: false, falhou: true }];
  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva,
      envios: enviosComFalha,
      periodoAtual: '2026-11',
      temErro: false
    }),
    false
  );
});

test('devePermanecerDispensada: mês diferente reaparece', () => {
  const envios = [{ id: 'envio-1', completo: true, falhou: false }];
  const assinaturaSalva = gerarAssinaturaDispensa({ envios, periodo: '2026-10' });

  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva,
      envios,
      periodoAtual: '2026-11',
      temErro: false
    }),
    false
  );
});

test('devePermanecerDispensada: dado corrompido reaparece', () => {
  const envios = [{ id: 'envio-1', completo: true, falhou: false }];

  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva: null,
      envios,
      periodoAtual: '2026-11',
      temErro: false
    }),
    false
  );

  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva: 'invalido',
      envios,
      periodoAtual: '2026-11',
      temErro: false
    }),
    false
  );

  assert.equal(
    devePermanecerDispensada({
      assinaturaSalva: { periodo: 123, itens: 'nao-array' },
      envios,
      periodoAtual: '2026-11',
      temErro: false
    }),
    false
  );
});

test('setUcondoStatus e getUcondoStatus gerenciam status e notificam evento', () => {
  setUcondoStatus({ ativosCount: 3, temErro: true });
  assert.deepEqual(getUcondoStatus(), { ativosCount: 3, temErro: true });

  setUcondoStatus({ ativosCount: 0, temErro: false });
  assert.deepEqual(getUcondoStatus(), { ativosCount: 0, temErro: false });
});
