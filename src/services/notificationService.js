import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

const DEDUPLICACAO_STORAGE_KEY = 'fastleituras_notificacoes_imediatas';

/**
 * Obtém os identificadores técnicos de lembretes já emitidos imediatamente na data civil informada.
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
 * Persiste no localStorage a data civil atual e as chaves técnicas dos lembretes emitidos imediatamente.
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
 * Recebe o ID numérico já resolvido e exclusivo dentro do lote agendado.
 */
const criarNotificacaoLeitura = ({ leitura, notifId, scheduleDate, title, body, focusType }) => ({
  title,
  body,
  id: notifId,
  schedule: { at: scheduleDate },
  sound: 'default',
  attachments: null,
  actionTypeId: '',
  extra: { id: leitura.id, focusType },
});

/**
 * Construtor modular de payload de notificação local agrupada (quando não há vagas para individualizar).
 * Não possui id de leitura individual no payload, repassando apenas focusType: 'atrasadas' para navegação cíclica.
 */
const criarNotificacaoAgrupada = ({ notifId, scheduleDate, title, body, focusType = 'atrasadas' }) => ({
  title,
  body,
  id: notifId,
  schedule: { at: scheduleDate },
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
   *    - Janela: Math.min(30, Math.floor(vagasRestantes / quantidadeAtrasadas));
   *    - Se não houver vagas para individualizar todos, cria no máximo 1 notificação diária agrupada por dia;
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
      const leituraDiaNotificadoSet = new Set();
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
      let novosIdsRegistrados = false;

      // Trava estrita de inserção: impede matematicamente que o array ultrapasse MAX_NOTIFICACOES_PENDENTES
      // e assegura no máximo uma notificação para a mesma leitura por data civil
      const tentarAdicionar = (notificacao) => {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) {
          return false;
        }
        const leituraId = notificacao.extra?.id;
        if (leituraId && notificacao.schedule?.at) {
          const atDate = notificacao.schedule.at;
          const y = atDate.getFullYear();
          const m = String(atDate.getMonth() + 1).padStart(2, '0');
          const d = String(atDate.getDate()).padStart(2, '0');
          const chaveDataCivil = `${leituraId}:${y}-${m}-${d}`;
          if (leituraDiaNotificadoSet.has(chaveDataCivil)) {
            return false;
          }
          leituraDiaNotificadoSet.add(chaveDataCivil);
        }
        notifications.push(notificacao);
        return true;
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

      // 1.1 Leituras que vencem hoje
      for (const item of leiturasHoje) {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
        const dataDia = new Date(currentYear, currentMonth, item.dueDay, 9, 0, 0);
        if (dataDia > now) {
          const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:dia`, idsUtilizadosNoLote);
          tentarAdicionar(
            criarNotificacaoLeitura({
              leitura: item.leitura,
              notifId,
              scheduleDate: dataDia,
              title: '🚨 Leitura deve ser realizada hoje',
              body: `A leitura do condomínio ${item.leitura.nome} está programada para hoje.`,
              focusType: 'hoje',
            })
          );
        } else {
          const chaveDia = `${item.leitura.id}:dia`;
          if (!idsNotificadosHoje.has(chaveDia)) {
            idsNotificadosHoje.add(chaveDia);
            novosIdsRegistrados = true;
            const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:dia`, idsUtilizadosNoLote);
            tentarAdicionar(
              criarNotificacaoLeitura({
                leitura: item.leitura,
                notifId,
                scheduleDate: new Date(Date.now() + (notifications.length + 1) * 5000),
                title: '🚨 Leitura deve ser realizada hoje',
                body: `A leitura do condomínio ${item.leitura.nome} está programada para hoje.`,
                focusType: 'hoje',
              })
            );
          }
        }
      }

      // 1.2 Vésperas de leituras que vencem amanhã (cujo lembrete ocorre hoje)
      for (const item of leiturasAmanha) {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
        const dataVespera = new Date(currentYear, currentMonth, item.dueDay - 1, 9, 0, 0);
        if (dataVespera > now) {
          const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:vespera`, idsUtilizadosNoLote);
          tentarAdicionar(
            criarNotificacaoLeitura({
              leitura: item.leitura,
              notifId,
              scheduleDate: dataVespera,
              title: '⏰ Leitura vence amanhã',
              body: `A leitura do condomínio ${item.leitura.nome} deve ser realizada amanhã.`,
              focusType: 'amanha',
            })
          );
        } else {
          const chaveVespera = `${item.leitura.id}:vespera`;
          if (!idsNotificadosHoje.has(chaveVespera)) {
            idsNotificadosHoje.add(chaveVespera);
            novosIdsRegistrados = true;
            const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:vespera`, idsUtilizadosNoLote);
            tentarAdicionar(
              criarNotificacaoLeitura({
                leitura: item.leitura,
                notifId,
                scheduleDate: new Date(Date.now() + (notifications.length + 1) * 5000),
                title: '⏰ Leitura vence amanhã',
                body: `A leitura do condomínio ${item.leitura.nome} deve ser realizada amanhã.`,
                focusType: 'amanha',
              })
            );
          }
        }
      }

      // 1.3 Leituras já atrasadas hoje - Aviso do dia atual
      for (const item of leiturasAtrasadas) {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
        const dataHoje09 = new Date(currentYear, currentMonth, hoje, 9, 0, 0);
        if (dataHoje09 > now) {
          const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:atrasada:${hojeFormatado}`, idsUtilizadosNoLote);
          tentarAdicionar(
            criarNotificacaoLeitura({
              leitura: item.leitura,
              notifId,
              scheduleDate: dataHoje09,
              title: '🚨 Leitura continua atrasada',
              body: `A leitura do condomínio ${item.leitura.nome} ainda não foi concluída.`,
              focusType: 'atrasadas',
            })
          );
        } else {
          const chaveAtrasadaHoje = `${item.leitura.id}:atrasada`;
          if (!idsNotificadosHoje.has(chaveAtrasadaHoje)) {
            idsNotificadosHoje.add(chaveAtrasadaHoje);
            novosIdsRegistrados = true;
            const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:atrasada:${hojeFormatado}`, idsUtilizadosNoLote);
            tentarAdicionar(
              criarNotificacaoLeitura({
                leitura: item.leitura,
                notifId,
                scheduleDate: new Date(Date.now() + (notifications.length + 1) * 5000),
                title: '🚨 Leitura continua atrasada',
                body: `A leitura do condomínio ${item.leitura.nome} ainda não foi concluída.`,
                focusType: 'atrasadas',
              })
            );
          }
        }
      }

      // ── 2. PRIORIDADE 2: AMANHÃ / VÉSPERAS FUTURAS ──

      // 2.1 Leituras que vencem amanhã (alarme programado para amanhã às 09:00)
      for (const item of leiturasAmanha) {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
        const dataDia = new Date(currentYear, currentMonth, item.dueDay, 9, 0, 0);
        const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:dia`, idsUtilizadosNoLote);
        tentarAdicionar(
          criarNotificacaoLeitura({
            leitura: item.leitura,
            notifId,
            scheduleDate: dataDia,
            title: '🚨 Leitura deve ser realizada hoje',
            body: `A leitura do condomínio ${item.leitura.nome} está programada para hoje.`,
            focusType: 'hoje',
          })
        );
      }

      // 2.2 Vésperas de leituras futuras (programadas para dueDay - 1 às 09:00)
      for (const item of leiturasFuturas) {
        if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;
        const dataVespera = new Date(currentYear, currentMonth, item.dueDay - 1, 9, 0, 0);
        if (dataVespera > now) {
          const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:vespera`, idsUtilizadosNoLote);
          tentarAdicionar(
            criarNotificacaoLeitura({
              leitura: item.leitura,
              notifId,
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
        const notifId = resolverIdUnicoDoLote(`${item.leitura.id}:dia`, idsUtilizadosNoLote);
        tentarAdicionar(
          criarNotificacaoLeitura({
            leitura: item.leitura,
            notifId,
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
        ? Math.min(30, Math.floor(vagasRestantes / totalLeiturasNaoConcluidas))
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

            const anoFuturo = dataFutura.getFullYear();
            const mesFuturo = String(dataFutura.getMonth() + 1).padStart(2, '0');
            const diaFuturo = String(dataFutura.getDate()).padStart(2, '0');
            const dataFuturaStr = `${anoFuturo}-${mesFuturo}-${diaFuturo}`;
            const chaveLeituraData = `${leitura.id}:${dataFuturaStr}`;

            // Previne duplicidade de notificação para a mesma leitura na mesma data civil
            if (leituraDiaNotificadoSet.has(chaveLeituraData)) continue;

            const notifId = resolverIdUnicoDoLote(`${leitura.id}:atrasada:${dataFuturaStr}`, idsUtilizadosNoLote);
            if (tentarAdicionar(
              criarNotificacaoLeitura({
                leitura,
                notifId,
                scheduleDate: dataFutura,
                title: '🚨 Leitura continua atrasada',
                body: `A leitura do condomínio ${leitura.nome} ainda não foi concluída.`,
                focusType: 'atrasadas',
              })
            )) {
              leituraDiaNotificadoSet.add(chaveLeituraData);
            }
          }
        }
      } else if (totalLeiturasNaoConcluidas > 0 && vagasRestantes > 0) {
        // Vagas insuficientes para individualizar todas as leituras por dia:
        // Cria no máximo uma notificação diária agrupada por dia civil futuro, respeitando estritamente o limite de 50.
        const diasAgrupados = Math.min(30, vagasRestantes);
        for (let offset = 1; offset <= diasAgrupados; offset++) {
          if (notifications.length >= MAX_NOTIFICACOES_PENDENTES) break;

          const dataFutura = new Date(currentYear, currentMonth, hoje + offset, 9, 0, 0);
          const anoFuturo = dataFutura.getFullYear();
          const mesFuturo = String(dataFutura.getMonth() + 1).padStart(2, '0');
          const diaFuturo = String(dataFutura.getDate()).padStart(2, '0');
          const dataFuturaStr = `${anoFuturo}-${mesFuturo}-${diaFuturo}`;

          const notifId = resolverIdUnicoDoLote(`agrupada:atrasadas:${dataFuturaStr}`, idsUtilizadosNoLote);
          tentarAdicionar(
            criarNotificacaoAgrupada({
              notifId,
              scheduleDate: dataFutura,
              title: '🚨 Leituras continuam atrasadas',
              body: `Você possui ${totalLeiturasNaoConcluidas} condomínios com leituras ainda não concluídas.`,
              focusType: 'atrasadas',
            })
          );
        }
      }

      if (novosIdsRegistrados) {
        salvarIdsNotificadosHoje(hojeFormatado, idsNotificadosHoje);
      }

      if (notifications.length > 0) {
        // Ordena pela data/hora para disparo ordenado pelo Android
        notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
        // Por construção estrita e garantida, notifications.length <= MAX_NOTIFICACOES_PENDENTES (50)
        await LocalNotifications.schedule({
          notifications,
        });
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
