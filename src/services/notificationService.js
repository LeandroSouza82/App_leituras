import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { HORARIOS_LEMBRETE, expandirHorariosNotificacao } from '../utils/horariosNotificacao';

const DEDUPLICACAO_STORAGE_KEY = 'fastleituras_notificacoes_imediatas';

/**
 * Obtém os identificadores técnicos de lembretes agendados na data civil informada.
 * Se a data registrada for anterior à data informada, descarta automaticamente os IDs do dia anterior.
 */
const getIdsNotificadosHoje = (dataHojeStr) => {
  try {
    const raw = localStorage.getItem(DEDUPLICACAO_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (parsed?.data === dataHojeStr && Array.isArray(parsed?.ids)) {
      return new Set(parsed.ids.map(String));
    }
    // A data mudou: descarta automaticamente os IDs do dia anterior
    localStorage.removeItem(DEDUPLICACAO_STORAGE_KEY);
    return new Set();
  } catch {
    return new Set();
  }
};

/**
 * Persiste no localStorage a data civil atual e as chaves técnicas dos lembretes agendados.
 */
const salvarIdsNotificadosHoje = (dataHojeStr, idsSet) => {
  try {
    const payload = {
      data: dataHojeStr,
      ids: Array.from(idsSet),
    };
    localStorage.setItem(DEDUPLICACAO_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[NotificationService] Falha ao persistir deduplicação no localStorage:', error);
  }
};

/**
 * Gera um ID numérico determinístico, estável e estritamente positivo (1 a 2147483646)
 * a partir de uma chave textual única (ex: "${leitura.id}:vespera" ou "${leitura.id}:dia").
 * O algoritmo calcula um hash determinístico (djb2) em valor absoluto delimitado a 31 bits
 * para compatibilidade com o sistema de alarmes do Android.
 */
const getStableNotificationId = (chaveIdentificadora) => {
  const str = String(chaveIdentificadora ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 2147483646) + 1;
};

/**
 * Resolve colisões de ID de forma determinística dentro do mesmo lote de agendamento
 * aplicando sondagem linear cíclica (linear probing) no espaço de 31 bits.
 */
const resolverIdUnicoDoLote = (chaveIdentificadora, idsUtilizadosNoLote) => {
  let notifId = getStableNotificationId(chaveIdentificadora);
  while (idsUtilizadosNoLote.has(notifId)) {
    notifId = (notifId % 2147483646) + 1;
  }
  idsUtilizadosNoLote.add(notifId);
  return notifId;
};

/**
 * Construtor modular de payload de notificação local para leituras.
 * O ID por horário é atribuído no ponto central de inserção no lote.
 */
const criarNotificacaoLeitura = ({ leitura, scheduleDate, title, body, focusType }) => ({
  title,
  body,
  schedule: { at: scheduleDate, allowWhileIdle: true },
  sound: 'default',
  attachments: null,
  actionTypeId: '',
  extra: { id: leitura.id, focusType },
});

/**
 * Construtor modular de payload de notificação local agrupada (quando não há vagas para individualizar).
 * Não possui id de leitura individual no payload, repassando apenas focusType: 'atrasadas' para navegação cíclica.
 */
const criarNotificacaoAgrupada = ({ scheduleDate, title, body, focusType = 'atrasadas' }) => ({
  title,
  body,
  schedule: { at: scheduleDate, allowWhileIdle: true },
  sound: 'default',
  attachments: null,
  actionTypeId: '',
  extra: { focusType },
});

/**
 * NotificationService - Serviço modular para gerenciar notificações locais e alarmes agendados.
 */
export const NotificationService = {
  /**
   * Consulta o estado atual da permissão de notificações locais.
   * Retorna:
   * - granted: boolean (true se display === 'granted')
   * - canRequest: boolean (true se o sistema ainda permite abrir o diálogo nativo: 'prompt' ou 'prompt-with-rationale')
   * - status: string ('granted' | 'denied' | 'prompt' | 'prompt-with-rationale')
   */
  async checkPermissionStatus() {
    if (!Capacitor.isNativePlatform()) {
      return { granted: true, canRequest: false, status: 'granted' };
    }
    try {
      const permission = await LocalNotifications.checkPermissions();
      const granted = permission.display === 'granted';
      // No Android 13+ (API 33+), 'prompt' ou 'prompt-with-rationale' permite nova solicitação via diálogo.
      // 'denied' indica recusa permanente que exige abertura das configurações.
      const canRequest = permission.display === 'prompt' || permission.display === 'prompt-with-rationale';
      return {
        granted,
        canRequest,
        status: permission.display,
      };
    } catch (error) {
      console.warn('[NotificationService] Erro ao consultar permissão:', error);
      return { granted: false, canRequest: false, status: 'denied' };
    }
  },

  /**
   * Solicita permissão para enviar notificações quando ainda for possível.
   * Retorna boolean: true se display === 'granted'.
   */
  async requestPermissions() {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }
    try {
      const permission = await LocalNotifications.requestPermissions();
      return permission.display === 'granted';
    } catch (error) {
      console.warn('[NotificationService] Falha ao solicitar permissão:', error);
      return false;
    }
  },

  /**
   * Tenta direcionar o usuário para as configurações do aplicativo no Android
   * quando a permissão foi negada permanentemente.
   */
  async openAppSettings() {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      await AppLauncher.openUrl({ url: 'package:com.fastleituras.app' });
      return true;
    } catch (error) {
      console.warn('[NotificationService] Não foi possível abrir configurações diretamente:', error);
      return false;
    }
  },

  /**
   * Cancela todas as notificações pendentes.
   * NOTA DE AUDITORIA: O uso de cancelAll() é seguro aqui porque o aplicativo atualmente
   * gerencia LocalNotifications de forma centralizada e exclusiva para notificações de leituras.
   * Caso outras categorias de notificações venham a ser adicionadas no futuro, este método
   * deverá ser isolado para cancelar apenas a faixa de IDs das leituras.
   */
  async cancelAll() {
    if (!Capacitor.isNativePlatform()) return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications && pending.notifications.length > 0) {
      const toCancel = pending.notifications.map(n => ({ id: n.id }));
      await LocalNotifications.cancel({ notifications: toCancel });
    }
  },

  /**
   * Cancela imediatamente todos os alarmes e notificações pendentes associados a uma leitura específica.
   */
  async cancelForLeitura(leituraId) {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const pending = await LocalNotifications.getPending();
      if (!pending?.notifications || pending.notifications.length === 0) return;
      const idStr = String(leituraId);
      const toCancel = pending.notifications
        .filter((n) => String(n.extra?.id) === idStr)
        .map((n) => ({ id: n.id }));
      if (toCancel.length > 0) {
        await LocalNotifications.cancel({ notifications: toCancel });
      }
    } catch (error) {
      console.warn('[NotificationService] Falha ao cancelar notificações da leitura:', error);
    }
  },

  /**
   * Agenda lembretes locais no Android para leituras não concluídas respeitando estritamente o limite de 50:
   * 1. Prioridade máxima: notificações de hoje (leituras de hoje, vésperas que caem hoje, atrasadas de hoje);
   * 2. Segunda prioridade: notificações de amanhã/véspera (leituras que vencem amanhã e vésperas futuras);
   * 3. Terceira prioridade: demais agendamentos futuros (dias de leitura futura);
   * 4. Lembretes diários de atraso com o app fechado para leituras atrasadas:
   *    - Vagas restantes calculadas estritamente: Math.max(0, MAX - notifications.length);
   *    - Janela: até 30 dias, reservando dois horários por leitura e dia;
   *    - Se não houver vagas para individualizar todos, cria avisos agrupados às 9h e 14h por dia;
   *    - Matematicamente impossível ultrapassar 50 notificações.
   * @param {Array} leituras - Lista completa de objetos de leitura.
   */
  async scheduleReadings(leituras = []) {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // Não tenta agendar notificações se a permissão não estiver concedida
      const { granted } = await this.checkPermissionStatus();
      if (!granted) {
        return;
      }

      await this.cancelAll();

      const leiturasNaoConcluidas = leituras.filter((l) => !l.completo && this._extractDay(l.diaLeitura));
      if (leiturasNaoConcluidas.length === 0) {
        return;
      }

      const MAX_NOTIFICACOES_PENDENTES = 50;
      const notifications = [];
      const idsUtilizadosNoLote = new Set();
      const horariosAdicionados = new Set();
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const hoje = now.getDate();

      // Formato civil local YYYY-MM-DD para controle de deduplicação diária
      const yearStr = String(currentYear);
      const monthStr = String(currentMonth + 1).padStart(2, '0');
      const dayStr = String(hoje).padStart(2, '0');
      const hojeFormatado = `${yearStr}-${monthStr}-${dayStr}`;

      const idsNotificadosHoje = getIdsNotificadosHoje(hojeFormatado);
      const idsAgendadosHoje = new Set(idsNotificadosHoje);

      // Cada data gera avisos às 9h e 14h. O limite conta notificações reais.
      const tentarAdicionar = (notificacao) => {
        for (const horario of expandirHorariosNotificacao(notificacao, now, idsNotificadosHoje)) {
          if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
          if (horariosAdicionados.has(horario.chave)) continue;
          horariosAdicionados.add(horario.chave);
          notifications.push({
            ...notificacao,
            id: resolverIdUnicoDoLote(horario.chave, idsUtilizadosNoLote),
            schedule: { at: horario.at, allowWhileIdle: true },
          });
          if (horario.hoje) idsAgendadosHoje.add(horario.chave);
        }
      };

      // Classificação das leituras pendentes
      const leiturasAtrasadas = [];
      const leiturasHoje = [];
      const leiturasAmanha = [];
      const leiturasFuturas = [];

      leiturasNaoConcluidas.forEach((leitura) => {
        const dia = this._extractDay(leitura.diaLeitura);
        if (!dia) return;
        const dueDay = dia;
        if (dueDay < hoje) {
          leiturasAtrasadas.push({ leitura, dueDay });
        } else if (dueDay === hoje) {
          leiturasHoje.push({ leitura, dueDay });
        } else if (dueDay === hoje + 1) {
          leiturasAmanha.push({ leitura, dueDay });
        } else {
          leiturasFuturas.push({ leitura, dueDay });
        }
      });

      // ── 1. PRIORIDADE 1: NOTIFICAÇÕES DE HOJE ──

      const avisosHoje = [
        { itens: leiturasHoje, title: '🚨 Leitura deve ser realizada hoje',
          body: (nome) => `A leitura do condomínio ${nome} está programada para hoje.`, focusType: 'hoje' },
        { itens: leiturasAmanha, title: '⏰ Leitura vence amanhã',
          body: (nome) => `A leitura do condomínio ${nome} deve ser realizada amanhã.`, focusType: 'amanha' },
        { itens: leiturasAtrasadas, title: '🚨 Leitura continua atrasada',
          body: (nome) => `A leitura do condomínio ${nome} ainda não foi concluída.`, focusType: 'atrasadas' },
      ];
      for (const aviso of avisosHoje) {
        for (const { leitura } of aviso.itens) {
          if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
          tentarAdicionar(criarNotificacaoLeitura({
            leitura,
            scheduleDate: new Date(currentYear, currentMonth, hoje, 9, 0, 0),
            title: aviso.title,
            body: aviso.body(leitura.nome),
            focusType: aviso.focusType,
          }));
        }
      }

      // ── 2. PRIORIDADE 2: AMANHÃ / VÉSPERAS FUTURAS ──

      // 2.1 Leituras que vencem amanhã (alarmes programados para amanhã às 9h e 14h)
      for (const item of leiturasAmanha) {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
        const dataDia = new Date(currentYear, currentMonth, item.dueDay, 9, 0, 0);

        tentarAdicionar(
          criarNotificacaoLeitura({
            leitura: item.leitura,
            scheduleDate: dataDia,
            title: '🚨 Leitura deve ser realizada hoje',
            body: `A leitura do condomínio ${item.leitura.nome} está programada para hoje.`,
            focusType: 'hoje',
          })
        );
      }

      // 2.2 Vésperas de leituras futuras (programadas para dueDay - 1 às 9h e 14h)
      for (const item of leiturasFuturas) {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
        const dataVespera = new Date(currentYear, currentMonth, item.dueDay - 1, 9, 0, 0);
        if (dataVespera > now) {
          tentarAdicionar(
            criarNotificacaoLeitura({
              leitura: item.leitura,
              scheduleDate: dataVespera,
              title: '⏰ Leitura vence amanhã',
              body: `A leitura do condomínio ${item.leitura.nome} deve ser realizada amanhã.`,
              focusType: 'amanha',
            })
          );
        }
      }

      // ── 3. PRIORIDADE 3: DEMAIS AGENDAMENTOS FUTUROS (DIAS DE LEITURA FUTURA) ──
      for (const item of leiturasFuturas) {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
        const dataDia = new Date(currentYear, currentMonth, item.dueDay, 9, 0, 0);

        tentarAdicionar(
          criarNotificacaoLeitura({
            leitura: item.leitura,
            scheduleDate: dataDia,
            title: '🚨 Leitura deve ser realizada hoje',
            body: `A leitura do condomínio ${item.leitura.nome} está programada para hoje.`,
            focusType: 'hoje',
          })
        );
      }

      // ── ETAPA 4: CÁLCULO ESTRITO DE VAGAS RESTANTES E JANELA DE DIAS DE ATRASO ──
      // Contagem real das notificações já inseridas no lote:
      const vagasRestantes = Math.max(0, MAX_NOTIFICACOES_PENDENTES - notifications.length);

      // Todas as leituras não concluídas precisam de cobertura de atraso a partir de dueDay + 1:
      const totalLeiturasNaoConcluidas = leiturasNaoConcluidas.length;
      const diasJanelaAtraso = totalLeiturasNaoConcluidas > 0
        ? Math.min(30, Math.floor(vagasRestantes / (totalLeiturasNaoConcluidas * HORARIOS_LEMBRETE.length)))
        : 0;

      // ── ETAPA 5: AGENDAMENTO PRÉVIO DE ATRASO (D+1, D+2...) COM O APP FECHADO ──
      if (diasJanelaAtraso > 0) {
        // Há vagas para agendamento individualizado de todas as leituras não concluídas por diasJanelaAtraso dias
        for (let offset = 1; offset <= diasJanelaAtraso; offset++) {
          if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;

          for (const leitura of leiturasNaoConcluidas) {
            if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;

            const dueDay = this._extractDay(leitura.diaLeitura);
            if (!dueDay) continue;

            // Ponto de partida do atraso para esta leitura:
            // Se dueDay < hoje (já atrasada), o próximo dia de atraso começa em hoje + offset.
            // Se dueDay >= hoje (vence hoje ou no futuro), o atraso D+1 começa estritamente em dueDay + offset.
            const diaAlvo = dueDay < hoje ? (hoje + offset) : (dueDay + offset);
            const dataFutura = new Date(currentYear, currentMonth, diaAlvo, 9, 0, 0);
            if (dataFutura <= now) continue;

            tentarAdicionar(
              criarNotificacaoLeitura({
                leitura,
                scheduleDate: dataFutura,
                title: '🚨 Leitura continua atrasada',
                body: `A leitura do condomínio ${leitura.nome} ainda não foi concluída.`,
                focusType: 'atrasadas',
              })
            );
          }
        }
      } else if (totalLeiturasNaoConcluidas > 0 && vagasRestantes > 0) {
        // Vagas insuficientes para individualizar todas as leituras por dia:
        // Cria avisos agrupados às 9h e 14h por dia civil futuro, respeitando estritamente o limite de 50.
        const diasAgrupados = Math.min(30, Math.floor(vagasRestantes / HORARIOS_LEMBRETE.length));
        for (let offset = 1; offset <= diasAgrupados; offset++) {
          if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;

          const dataFutura = new Date(currentYear, currentMonth, hoje + offset, 9, 0, 0);
          tentarAdicionar(
            criarNotificacaoAgrupada({
              scheduleDate: dataFutura,
              title: '🚨 Leituras continuam atrasadas',
              body: `Você possui ${totalLeiturasNaoConcluidas} condomínios com leituras ainda não concluídas.`,
              focusType: 'atrasadas',
            })
          );
        }
      }

      if (notifications.length > 0) {
        // Ordena pela data/hora para disparo ordenado pelo Android
        notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
        // Por construção estrita e garantida, notifications.length <= MAX_NOTIFICACOES_PENDENTES (50)
        await LocalNotifications.schedule({
          notifications,
        });
        salvarIdsNotificadosHoje(hojeFormatado, idsAgendadosHoje);
      }
    } catch (error) {
      console.warn('[NotificationService] Falha ao agendar notificações:', error);
    }
  },

  /**
   * Escuta o toque em uma notificação local e repassa o foco solicitado para a UI.
   */
  async addActionListener(onAction) {
    if (!Capacitor.isNativePlatform()) return null;

    return LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const extra = event?.notification?.extra || {};
      onAction?.(extra);
    });
  },

  /**
   * Auxiliar para extrair o dia numérico de strings como "Dia 10" ou "10 a 15".
   */
  _extractDay(diaTexto) {
    if (!diaTexto) return null;
    const match = String(diaTexto).match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }
};
