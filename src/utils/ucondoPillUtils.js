/**
 * Utilitários para posicionamento, limites de viewport, snap, detecção de descarte,
 * persistência de dispensa e estado global da pílula de envios do uCondo.
 */

let currentUcondoStatus = { ativosCount: 0, temErro: false };

/**
 * Atualiza o status público dos envios do uCondo e emite evento para ouvintes (ex.: SideMenu).
 */
export function setUcondoStatus(status) {
  currentUcondoStatus = {
    ativosCount: Number(status?.ativosCount) || 0,
    temErro: Boolean(status?.temErro)
  };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('ucondo_status_alterado', { detail: currentUcondoStatus })
    );
  }
}

/**
 * Retorna o status síncrono atual dos envios do uCondo.
 */
export function getUcondoStatus() {
  return currentUcondoStatus;
}

/**
 * Obtém os limites seguros de movimentação da pílula dentro da viewport.
 */
export function getViewportBounds({
  windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360,
  windowHeight = typeof window !== 'undefined' ? window.innerHeight : 640,
  pillWidth = 140,
  pillHeight = 36,
  safeAreaTop = 0,
  safeAreaBottom = 0,
  margins = {}
} = {}) {
  const left = margins.left ?? 16;
  const right = margins.right ?? 16;
  const top = margins.top ?? Math.max(16, safeAreaTop + 8);
  const bottom = margins.bottom ?? 80 + safeAreaBottom;

  const minX = left;
  const maxX = Math.max(minX, windowWidth - pillWidth - right);
  const minY = top;
  const maxY = Math.max(minY, windowHeight - pillHeight - bottom);

  return { minX, maxX, minY, maxY, windowWidth, windowHeight };
}

/**
 * Calcula a posição inicial padrão (canto inferior direito, acima da barra de abas).
 */
export function getDefaultPosition({
  windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360,
  windowHeight = typeof window !== 'undefined' ? window.innerHeight : 640,
  pillWidth = 140,
  pillHeight = 36,
  safeAreaBottom = 0,
  margins = {}
} = {}) {
  const bounds = getViewportBounds({
    windowWidth,
    windowHeight,
    pillWidth,
    pillHeight,
    safeAreaBottom,
    margins
  });
  return {
    x: bounds.maxX,
    y: bounds.maxY
  };
}

/**
 * Calcula a posição com snap magnético na borda lateral mais próxima (esquerda ou direita),
 * travando a coordenada Y dentro dos limites seguros da viewport.
 */
export function calculateSnapPosition({
  x,
  y,
  pillWidth = 140,
  pillHeight = 36,
  windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360,
  windowHeight = typeof window !== 'undefined' ? window.innerHeight : 640,
  safeAreaTop = 0,
  safeAreaBottom = 0,
  margins = {}
}) {
  const bounds = getViewportBounds({
    windowWidth,
    windowHeight,
    pillWidth,
    pillHeight,
    safeAreaTop,
    safeAreaBottom,
    margins
  });

  const clampedY = Math.min(Math.max(y, bounds.minY), bounds.maxY);
  const pillCenterX = x + pillWidth / 2;
  const screenCenterX = windowWidth / 2;

  const snappedX = pillCenterX < screenCenterX ? bounds.minX : bounds.maxX;

  return {
    x: Math.round(snappedX),
    y: Math.round(clampedY)
  };
}

/**
 * Verifica se o centro da pílula está dentro da área de influência do alvo circular de descarte.
 */
export function isInsideTarget({
  pillX,
  pillY,
  pillWidth = 140,
  pillHeight = 36,
  targetX,
  targetY,
  targetRadius = 26,
  thresholdMargin = 48
}) {
  if (typeof targetX !== 'number' || typeof targetY !== 'number') return false;
  const pillCenterX = pillX + pillWidth / 2;
  const pillCenterY = pillY + pillHeight / 2;
  const distance = Math.hypot(pillCenterX - targetX, pillCenterY - targetY);
  const maxDistance = targetRadius + thresholdMargin;
  return distance <= maxDistance;
}

/**
 * Valida se uma posição salva em localStorage ainda é segura na viewport atual
 * (ex.: após rotação de tela ou redimensionamento).
 */
export function isValidSavedPosition(pos, {
  windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360,
  windowHeight = typeof window !== 'undefined' ? window.innerHeight : 640,
  pillWidth = 140,
  pillHeight = 36,
  safeAreaTop = 0,
  safeAreaBottom = 0
} = {}) {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return false;
  if (Number.isNaN(pos.x) || Number.isNaN(pos.y)) return false;

  const bounds = getViewportBounds({
    windowWidth,
    windowHeight,
    pillWidth,
    pillHeight,
    safeAreaTop,
    safeAreaBottom
  });

  return (
    pos.x >= bounds.minX - 2 &&
    pos.x <= bounds.maxX + 2 &&
    pos.y >= bounds.minY - 2 &&
    pos.y <= bounds.maxY + 2
  );
}

/**
 * Classifica o gesto do ponteiro entre 'toque', 'arraste' ou 'segurar'.
 */
export function classificarGesto({
  distancia = 0,
  duracaoMs = 0,
  isHolding = false,
  limiteDistancia = 10,
  limiteDuracao = 350
} = {}) {
  if (isHolding || duracaoMs >= limiteDuracao) {
    return 'segurar';
  }
  if (distancia > limiteDistancia) {
    return 'arraste';
  }
  return 'toque';
}

/**
 * Chaves estáveis de um envio: o próprio id e os aliases (ex.: id local do pedido
 * e id definitivo atribuído pelo servidor), para que a confirmação no servidor de um
 * pedido que já estava na fila local não conte como pedido novo.
 */
const chavesDoEnvio = (e) =>
  [e?.id, ...(Array.isArray(e?.aliases) ? e.aliases : [])]
    .filter(v => v !== undefined && v !== null && v !== '')
    .map(String);

/**
 * Gera uma assinatura serializável do estado atual dos envios ao dispensar a pílula.
 * Usa estritamente campos estáveis (ID, aliases e status simplificado), ignorando campos voláteis.
 */
export function gerarAssinaturaDispensa({ envios = [], periodo = '' } = {}) {
  const itens = (envios || []).map(e => ({
    id: String(e.id),
    aliases: chavesDoEnvio(e).filter(k => k !== String(e.id)),
    status: (e.falhou || e.erroPedido) ? 'erro' : (e.completo ? 'concluido' : 'ativo')
  })).sort((a, b) => a.id.localeCompare(b.id));

  return {
    periodo: String(periodo || ''),
    itens
  };
}

/**
 * Verifica se a pílula de envios deve permanecer escondida com base na assinatura salva.
 * Ocultar é só uma preferência visual ("Ocultar até o próximo envio"). Continua escondida se:
 * - Os dados ainda não carregaram (carregado = false) e a assinatura é válida para o mês; ou
 * - O mês é o mesmo e todos os envios atuais já eram conhecidos no momento do descarte
 *   (por id ou alias), independentemente de estarem ativos, com erro ou de terem
 *   avançado o progresso/status.
 * Reaparece (retorna false) apenas com dado corrompido, mês diferente ou pedido realmente novo.
 * O parâmetro temErro é aceito por compatibilidade, mas não reexibe a pílula: os avisos
 * continuam visíveis no painel e no item "Envios para o uCondo" do menu.
 */
export function devePermanecerDispensada({
  assinaturaSalva,
  envios = [],
  periodoAtual = '',
  carregado = true
} = {}) {
  // 1. Validação estrutural de integridade do dado salvo (ignora dados corrompidos)
  if (!assinaturaSalva || typeof assinaturaSalva !== 'object') return false;
  if (typeof assinaturaSalva.periodo !== 'string' || !assinaturaSalva.periodo) return false;
  if (!Array.isArray(assinaturaSalva.itens)) return false;

  // 2. Mês diferente faz a pílula reaparecer
  if (periodoAtual && assinaturaSalva.periodo !== String(periodoAtual)) return false;

  // 3. Enquanto os dados ainda não foram carregados pela primeira vez:
  // NÃO toma decisão de descarte e preserva a dispensa para evitar flicker na inicialização.
  if (!carregado) {
    return true;
  }

  // 4. Conjunto de chaves conhecidas no momento do descarte
  const conhecidas = new Set();
  for (const salvo of assinaturaSalva.itens) {
    if (!salvo || typeof salvo !== 'object') return false;
    chavesDoEnvio(salvo).forEach(k => conhecidas.add(k));
  }

  // 5. Só um pedido realmente novo (nenhuma chave conhecida) faz a pílula reaparecer
  return (envios || []).every(e => chavesDoEnvio(e).some(k => conhecidas.has(k)));
}
