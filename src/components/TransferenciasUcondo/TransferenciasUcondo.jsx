import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Cloud, CloudUpload, Check, CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { lerEnvios, progressoTransferencia } from '../../services/ucondoTransferModel';
import { consultarEnviosUcondo, processarEnviosUcondo } from '../../services/ucondoTransferService';
import {
  getDefaultPosition,
  calculateSnapPosition,
  isInsideTarget,
  isValidSavedPosition,
  classificarGesto,
  gerarAssinaturaDispensa,
  devePermanecerDispensada,
  setUcondoStatus
} from '../../utils/ucondoPillUtils';
import './TransferenciasUcondo.css';

const STORAGE_KEY = 'ucondo_pill_pos';
const STORAGE_DISPENSA_KEY = 'ucondo_pill_dispensada_v1';

export default function TransferenciasUcondo({ userId }) {
  const [locais, setLocais] = useState([]);
  const [remotos, setRemotos] = useState({ pedidos: [], trabalhos: [], lotes: [] });
  const [erro, setErro] = useState('');
  const [verHistorico, setVerHistorico] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  // Estados da interface flutuante
  const [modalAberto, setModalAberto] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [dispensada, setDispensada] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_DISPENSA_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const periodoAtual = new Date().toISOString().slice(0, 7);
      return devePermanecerDispensada({
        assinaturaSalva: parsed,
        envios: [],
        periodoAtual,
        carregado: false
      });
    } catch {
      return false;
    }
  });
  const [showTarget, setShowTarget] = useState(false);
  const [isOverTarget, setIsOverTarget] = useState(false);

  // Refs de controle de DOM e gestos
  const pillRef = useRef(null);
  const targetRef = useRef(null);
  const fecharBtnRef = useRef(null);
  const dialogRef = useRef(null);
  const pillBtnRef = useRef(null);

  const abertoEmRef = useRef(0);
  const overlayPointerDownRef = useRef(false);

  const posRef = useRef({ x: 0, y: 0 });

  const dragState = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    startTime: 0,
    startPillX: 0,
    startPillY: 0,
    isDragging: false,
    isHolding: false,
    holdTimer: null,
    isInsideTarget: false,
    hasVibratedInside: false
  });

  // Polling e sincronização de dados (mantido estritamente idêntico ao original)
  useEffect(() => {
    let encerrado = false, ocupado = false;
    const lerLocais = () => {
      try { if (!encerrado) setLocais(lerEnvios(userId)); }
      catch (e) { if (!encerrado) setErro(e.message); }
    };
    const atualizar = async () => {
      if (ocupado) return;
      ocupado = true;
      try {
        await processarEnviosUcondo(userId);
        const estado = await consultarEnviosUcondo(userId);
        if (!encerrado) {
          setRemotos(estado);
          setErro('');
          setCarregado(true);
        }
      } catch {
        if (!encerrado) setErro('Sem atualização do servidor. As últimas contagens foram mantidas; seus dados locais continuam salvos.');
      } finally { ocupado = false; lerLocais(); }
    };
    lerLocais();
    void atualizar();
    const timer = setInterval(atualizar, 5000);
    window.addEventListener('envios_ucondo_atualizados', lerLocais);
    window.addEventListener('online', atualizar);
    return () => {
      encerrado = true;
      clearInterval(timer);
      window.removeEventListener('envios_ucondo_atualizados', lerLocais);
      window.removeEventListener('online', atualizar);
    };
  }, [userId]);

  // Processamento dos dados de transferência
  const remotosIds = new Set(remotos.pedidos.map(p => p.id));
  const cards = remotos.pedidos.map(p => ({
    id: p.id,
    nome: p.condominio_nome,
    periodo: p.periodo,
    ...progressoTransferencia(p, remotos.trabalhos, remotos.lotes.find(l => l.id === p.solicitacao_id)),
    erroPedido: p.mensagem,
    remoto: true
  }));
  const locaisPendentes = locais.filter(p => !remotosIds.has(p.serverId)).map(p => ({
    id: p.id,
    nome: p.nome,
    periodo: p.periodo,
    total: p.itens.length,
    sincronizadas: p.sincronizadas,
    completo: false,
    falhou: Boolean(p.erro),
    remoto: false,
    percentual: Math.min(99, Math.floor(p.sincronizadas * 100 / p.itens.length)),
    etapa: p.erro ? 'Precisa de atenção' : p.serverId ? 'Recebido pelo servidor' : 'Sincronizando com o servidor',
    detalhe: p.erro || (p.serverId ? 'O robô pode continuar na AWS. Aguardando o estado atualizado.'
      : 'Você pode continuar as leituras. Mantenha o app com internet até o servidor confirmar o recebimento.')
  }));

  const todos = [...locaisPendentes, ...cards];
  const concluidos = todos.filter(p => p.completo);
  const ativos = todos.filter(p => !p.completo).sort((a,b) => Number(!a.atualizadoEm) - Number(!b.atualizadoEm));
  const visiveis = [...(verTodos ? ativos : ativos.slice(0, 1)), ...(verHistorico ? concluidos : [])];

  const temErroGeral = Boolean(erro) || ativos.some(a => a.falhou || a.erroPedido);

  // Notifica ouvintes globais (SideMenu) e avalia persistência da dispensa
  useEffect(() => {
    setUcondoStatus({ ativosCount: ativos.length, temErro: temErroGeral });

    let assinaturaSalva = null;
    try {
      const raw = localStorage.getItem(STORAGE_DISPENSA_KEY);
      if (raw) assinaturaSalva = JSON.parse(raw);
    } catch {}

    if (!assinaturaSalva) {
      setDispensada(false);
      return;
    }

    const periodo = todos[0]?.periodo || new Date().toISOString().slice(0, 7);
    const deveOcultar = devePermanecerDispensada({
      assinaturaSalva,
      envios: todos,
      periodoAtual: periodo,
      temErro: temErroGeral,
      carregado
    });

    if (!deveOcultar) {
      if (carregado || !assinaturaSalva?.itens) {
        try { localStorage.removeItem(STORAGE_DISPENSA_KEY); } catch {}
      }
      setDispensada(false);
    } else {
      setDispensada(true);
    }
  }, [todos, ativos.length, temErroGeral, carregado]);

  // Listener para abertura remota do modal (ex.: clique no item do SideMenu)
  useEffect(() => {
    const onAbrirRemoto = () => {
      abertoEmRef.current = Date.now();
      setModalAberto(true);
    };
    window.addEventListener('abrir_envios_ucondo', onAbrirRemoto);
    return () => window.removeEventListener('abrir_envios_ucondo', onAbrirRemoto);
  }, []);

  // Salvar dispensa com persistência segura
  const dispensarComAssinatura = useCallback(() => {
    const periodo = todos[0]?.periodo || new Date().toISOString().slice(0, 7);
    const assinatura = gerarAssinaturaDispensa({ envios: todos, periodo });
    try {
      localStorage.setItem(STORAGE_DISPENSA_KEY, JSON.stringify(assinatura));
    } catch {}
    setDispensada(true);
  }, [todos]);

  // Inicialização e recuperação de posição da pílula
  const aplicarPosicao = useCallback((pos, animar = false) => {
    posRef.current = pos;
    if (pillRef.current) {
      pillRef.current.style.transition = animar
        ? 'transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 180ms ease-out'
        : 'none';
      pillRef.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      pillRef.current.style.opacity = '1';
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let posInicial = null;
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (isValidSavedPosition(parsed, { windowWidth: window.innerWidth, windowHeight: window.innerHeight })) {
          posInicial = parsed;
        }
      }
    } catch {}

    if (!posInicial) {
      posInicial = getDefaultPosition({
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        pillWidth: pillRef.current?.offsetWidth || 150,
        pillHeight: pillRef.current?.offsetHeight || 38
      });
    }

    aplicarPosicao(posInicial);

    const onResize = () => {
      const pillWidth = pillRef.current?.offsetWidth || 150;
      const pillHeight = pillRef.current?.offsetHeight || 38;
      const reajustado = calculateSnapPosition({
        x: posRef.current.x,
        y: posRef.current.y,
        pillWidth,
        pillHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight
      });
      aplicarPosicao(reajustado);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [aplicarPosicao]);

  // Gestos Pointer Events na pílula
  const onPointerDown = (e) => {
    if (e.button !== 0) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const state = dragState.current;
    state.pointerId = e.pointerId;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.startTime = Date.now();
    state.startPillX = posRef.current.x;
    state.startPillY = posRef.current.y;
    state.isDragging = false;
    state.isHolding = false;
    state.isInsideTarget = false;
    state.hasVibratedInside = false;

    if (pillRef.current) {
      pillRef.current.style.transition = 'none';
    }

    state.holdTimer = setTimeout(() => {
      state.isHolding = true;
      setShowTarget(true);
      try { navigator?.vibrate?.(15); } catch {}
    }, 350);
  };

  const onPointerMove = (e) => {
    const state = dragState.current;
    if (state.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;
    const dist = Math.hypot(deltaX, deltaY);

    if (dist > 10) {
      if (state.holdTimer) {
        clearTimeout(state.holdTimer);
        state.holdTimer = null;
      }
      state.isDragging = true;
      setShowTarget(true);
    }

    if (state.isDragging || state.isHolding) {
      const currentX = state.startPillX + deltaX;
      const currentY = state.startPillY + deltaY;

      const pillWidth = pillRef.current?.offsetWidth || 150;
      const pillHeight = pillRef.current?.offsetHeight || 38;

      const targetX = window.innerWidth / 2;
      const targetY = window.innerHeight - 85 - (pillHeight / 2);

      const inside = isInsideTarget({
        pillX: currentX,
        pillY: currentY,
        pillWidth,
        pillHeight,
        targetX,
        targetY,
        targetRadius: 26,
        thresholdMargin: 48
      });

      state.isInsideTarget = inside;

      if (inside && !state.hasVibratedInside) {
        state.hasVibratedInside = true;
        setIsOverTarget(true);
        try { navigator?.vibrate?.(15); } catch {}
      } else if (!inside && state.hasVibratedInside) {
        state.hasVibratedInside = false;
        setIsOverTarget(false);
      }

      if (pillRef.current) {
        const scale = inside ? 0.85 : 1;
        pillRef.current.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${scale})`;
      }
    }
  };

  const onPointerUp = (e) => {
    const state = dragState.current;
    if (state.pointerId !== e.pointerId) return;

    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;
    const distancia = Math.hypot(deltaX, deltaY);
    const duracaoMs = Date.now() - state.startTime;

    const gesto = classificarGesto({
      distancia,
      duracaoMs,
      isHolding: state.isHolding,
      limiteDistancia: 10,
      limiteDuracao: 350
    });

    setShowTarget(false);
    setIsOverTarget(false);
    state.pointerId = null;

    if (gesto === 'toque') {
      try { e.preventDefault(); } catch {}
      abertoEmRef.current = Date.now();
      setModalAberto(true);
      return;
    }

    // Arrastou ou segurou: NUNCA abre modal
    if (state.isInsideTarget) {
      if (pillRef.current) {
        const targetX = window.innerWidth / 2 - (pillRef.current.offsetWidth / 2);
        const targetY = window.innerHeight - 85;
        pillRef.current.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
        pillRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) scale(0)`;
        pillRef.current.style.opacity = '0';
      }
      setTimeout(() => {
        dispensarComAssinatura();
      }, 180);
      return;
    }

    // Soltou fora do alvo: Snap na borda lateral mais próxima
    const finalX = state.startPillX + deltaX;
    const finalY = state.startPillY + deltaY;

    const pillWidth = pillRef.current?.offsetWidth || 150;
    const pillHeight = pillRef.current?.offsetHeight || 38;

    const snapped = calculateSnapPosition({
      x: finalX,
      y: finalY,
      pillWidth,
      pillHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });

    aplicarPosicao(snapped, true);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
    } catch {}
  };

  const onPointerCancel = () => {
    const state = dragState.current;
    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }
    setShowTarget(false);
    setIsOverTarget(false);
    state.pointerId = null;
    aplicarPosicao(posRef.current, true);
  };

  // Tratamento de botão voltar, tecla Escape e foco no Modal
  const fecharModal = useCallback(() => {
    setModalAberto(false);
  }, []);

  const ocultarAteProximoEnvio = useCallback(() => {
    setModalAberto(false);
    dispensarComAssinatura();
  }, [dispensarComAssinatura]);

  useEffect(() => {
    if (!modalAberto) {
      if (pillBtnRef.current && pillBtnRef.current.isConnected) {
        pillBtnRef.current.focus();
      }
      return;
    }

    const focoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharBtnRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        fecharModal();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focaveis = [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href], summary, [tabindex="0"]')].filter(el => el.offsetParent !== null);
      const primeiro = focaveis[0];
      const ultimo = focaveis.at(-1);
      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault();
        ultimo?.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    let saiu = false, backListener;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', () => fecharModal()).then(listener => {
        if (saiu) listener.remove();
        else backListener = listener;
      });
    }

    return () => {
      saiu = true;
      backListener?.remove();
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflowAnterior;
      if (focoAnterior && focoAnterior.isConnected) focoAnterior.focus();
    };
  }, [modalAberto, fecharModal]);

  // Se não há transferências nem pílula visível e o modal não está aberto, nada é renderizado
  const exibirPilula = todos.length > 0 && !dispensada;

  // Os envios chegam depois da montagem inicial: posiciona também a pílula
  // quando ela aparece após o polling ou volta a ser exibida.
  useEffect(() => {
    if (!exibirPilula || !pillRef.current) return;
    aplicarPosicao(calculateSnapPosition({
      ...posRef.current,
      pillWidth: pillRef.current.offsetWidth,
      pillHeight: pillRef.current.offsetHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    }));
  }, [exibirPilula, aplicarPosicao]);
  if (!exibirPilula && !modalAberto) return null;

  // Informações para a pílula
  const temAtivos = ativos.length > 0;
  const itemAtivoPrincipal = temAtivos ? ativos[0] : null;
  const percentualPrincipal = itemAtivoPrincipal ? itemAtivoPrincipal.percentual : 100;
  const maisAtivosContagem = ativos.length > 1 ? ` +${ativos.length - 1}` : '';

  let pillTexto = '';
  let pillAriaLabel = '';
  let PillIcon = Cloud;
  let pillClasse = 'ucondo-pill';

  if (temErroGeral) {
    pillClasse += ' ucondo-pill-alerta';
    PillIcon = AlertTriangle;
    if (temAtivos) {
      pillTexto = `uCondo • ${percentualPrincipal}%${maisAtivosContagem}`;
      pillAriaLabel = `Envios para o uCondo com atenção necessária, ${percentualPrincipal}%, toque para abrir`;
    } else {
      pillTexto = `uCondo • Atenção`;
      pillAriaLabel = `Envios para o uCondo com atenção necessária, toque para abrir`;
    }
  } else if (temAtivos) {
    PillIcon = CloudUpload;
    pillTexto = `uCondo • ${percentualPrincipal}%${maisAtivosContagem}`;
    pillAriaLabel = `Envios para o uCondo, ${percentualPrincipal}%, toque para abrir`;
  } else {
    PillIcon = Check;
    pillClasse += ' ucondo-pill-concluido';
    pillTexto = `uCondo • ${concluidos.length} concluído(s)`;
    pillAriaLabel = `Envios para o uCondo, ${concluidos.length} concluído(s), toque para abrir`;
  }

  return createPortal(
    <>
      {/* Pílula flutuante (apenas se houver envios e não estiver dispensada) */}
      {exibirPilula && (
        <button
          ref={(el) => {
            pillRef.current = el;
            pillBtnRef.current = el;
          }}
          type="button"
          className={pillClasse}
          aria-label={pillAriaLabel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="ucondo-pill-content">
            <PillIcon size={16} aria-hidden="true" className="ucondo-pill-icone" />
            <span className="ucondo-pill-label">{pillTexto}</span>
          </span>
          {temAtivos && (
            <span className="ucondo-pill-progresso-trilho" aria-hidden="true">
              <span
                className="ucondo-pill-progresso-barra"
                style={{ width: `${percentualPrincipal}%` }}
              />
            </span>
          )}
        </button>
      )}

      {/* Alvo circular "X" de descarte */}
      <div
        ref={targetRef}
        className={`ucondo-dismiss-target ${showTarget ? 'ativo' : ''} ${isOverTarget ? 'hover' : ''}`}
        aria-hidden="true"
      >
        <X size={24} />
      </div>

      {/* Modal com o card completo original (ou estado vazio se aberto pelo menu sem envios) */}
      {modalAberto && (
        <div
          className="ucondo-modal-overlay"
          onPointerDown={(e) => {
            overlayPointerDownRef.current = (e.target === e.currentTarget);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && overlayPointerDownRef.current) {
              if (Date.now() - abertoEmRef.current > 250) {
                fecharModal();
              }
            }
          }}
        >
          <section
            ref={dialogRef}
            className="ucondo-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ucondo-modal-titulo"
          >
            <header className="ucondo-transferencias-titulo">
              <CloudUpload size={20} aria-hidden="true" />
              <strong id="ucondo-modal-titulo">Envios para o uCondo</strong>
              {concluidos.length > 0 && (
                <button
                  type="button"
                  className="ucondo-btn-historico"
                  onClick={() => setVerHistorico(v => !v)}
                >
                  {verHistorico ? 'Ocultar concluídos' : `${concluidos.length} concluído(s)`}
                </button>
              )}
              <button
                ref={fecharBtnRef}
                type="button"
                className="ucondo-modal-fechar"
                onClick={fecharModal}
                aria-label="Fechar painel de envios"
              >
                <X size={20} />
              </button>
            </header>

            {/* Caso não haja nenhum envio ainda */}
            {todos.length === 0 ? (
              <div className="ucondo-modal-vazio">
                <Cloud size={34} className="ucondo-icone-vazio" aria-hidden="true" />
                <p>Nenhum envio ainda</p>
              </div>
            ) : (
              <>
                {ativos.length > 1 && (
                  <button
                    type="button"
                    className="ucondo-ver-fila"
                    onClick={() => setVerTodos(v => !v)}
                  >
                    {verTodos ? 'Recolher fila' : `Ver os ${ativos.length} envios em andamento ou na fila`}
                  </button>
                )}

                {erro && <p className="ucondo-transferencia-aviso" role="status">{erro}</p>}

                {/* Quando há envios ativos ou o histórico está aberto, renderiza os cards */}
                {visiveis.length > 0 ? (
                  <div className="ucondo-modal-lista-cards">
                    {visiveis.map(card => (
                      <article
                        key={card.id}
                        className={`ucondo-transferencia-card ${card.falhou ? 'tem-erro' : ''}`}
                      >
                        <div className="ucondo-transferencia-heading">
                          <strong>{card.nome} · {card.periodo}</strong>
                          {card.completo ? (
                            <CheckCircle2 size={18} aria-hidden="true" />
                          ) : card.falhou ? (
                            <AlertCircle size={18} aria-hidden="true" />
                          ) : null}
                        </div>
                        <p className="ucondo-transferencia-etapa">
                          {card.etapa} <strong>{card.remoto ? 'Total ' : ''}{card.percentual}%</strong>
                        </p>
                        <progress
                          value={card.percentual}
                          max="100"
                          aria-label={`${card.nome}: ${card.etapa}`}
                        />
                        {card.remoto ? (
                          <p className="ucondo-transferencia-contagens">
                            Leituras confirmadas: <strong>{card.leituras} de {card.total}</strong><br />
                            Fotos confirmadas: <strong>{card.fotos} de {card.total - (card.semFoto || 0)}</strong>
                            {card.semFoto > 0 && <><br />Fotos dispensadas: <strong>{card.semFoto}</strong></>}
                          </p>
                        ) : (
                          <p className="ucondo-transferencia-contagens">
                            Leituras e fotos sincronizadas: <strong>{card.sincronizadas} de {card.total}</strong>
                          </p>
                        )}
                        <p className="ucondo-transferencia-detalhe">{card.erroPedido || card.detalhe}</p>
                        {card.atualizadoEm && (
                          <p className="ucondo-transferencia-detalhe">
                            Último sinal do robô: {new Date(card.atualizadoEm).toLocaleTimeString('pt-BR')}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  /* Estado "somente concluídos": omite seções de envio ativo vazias e exibe resumo */
                  <div className="ucondo-modal-concluidos-status">
                    <CheckCircle2 size={28} className="ucondo-icone-concluido-destaque" aria-hidden="true" />
                    <p className="ucondo-texto-concluidos-resumo">
                      Todos os envios foram concluídos ({concluidos.length}).
                    </p>
                    <button
                      type="button"
                      className="ucondo-btn-ver-concluidos"
                      onClick={() => setVerHistorico(true)}
                    >
                      Ver os {concluidos.length} concluído(s)
                    </button>
                  </div>
                )}

                <footer className="ucondo-modal-rodape">
                  <button
                    type="button"
                    className="ucondo-btn-ocultar"
                    onClick={ocultarAteProximoEnvio}
                  >
                    Ocultar até o próximo envio
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </>,
    document.body
  );
}
