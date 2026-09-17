import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { expandirHorariosNotificacao, dataCivilNotificacao } from '../utils/horariosNotificacao';
import { criarPlanoLembretes } from '../utils/planoLembretes';

let agendamentoEmFila = Promise.resolve();

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
 * NotificationService - Serviço modular para gerenciar notificações locais e alarmes agendados.
 */
export const NotificationService = {
  /**
   * Consulta o estado atual da permissão de notificações locais.
   * Retorna:
   * - granted: boolean (true quando notificações e alarmes exatos estão autorizados)
   * - notificationGranted: boolean (true se display === 'granted')
   * - exactAlarmGranted: boolean (true se o Android permite alarmes exatos)
   * - canRequest: boolean (true se o sistema ainda permite abrir o diálogo nativo: 'prompt' ou 'prompt-with-rationale')
   * - status: string ('granted' | 'denied' | 'prompt' | 'prompt-with-rationale')
   */
  async checkPermissionStatus() {
    if (!Capacitor.isNativePlatform()) {
      return {
        granted: true,
        notificationGranted: true,
        exactAlarmGranted: true,
        canRequest: false,
        status: 'granted',
        exactAlarmStatus: 'granted',
      };
    }
    try {
      const permission = await LocalNotifications.checkPermissions();
      const exactAlarmPermission = Capacitor.getPlatform() === 'android'
        ? await LocalNotifications.checkExactNotificationSetting()
        : { exact_alarm: 'granted' };
      const notificationGranted = permission.display === 'granted';
      const exactAlarmGranted = exactAlarmPermission.exact_alarm === 'granted';
      // No Android 13+ (API 33+), 'prompt' ou 'prompt-with-rationale' permite nova solicitação via diálogo.
      // 'denied' indica recusa permanente que exige abertura das configurações.
      const canRequest = permission.display === 'prompt' || permission.display === 'prompt-with-rationale';
      return {
        granted: notificationGranted && exactAlarmGranted,
        notificationGranted,
        exactAlarmGranted,
        canRequest,
        status: permission.display,
        exactAlarmStatus: exactAlarmPermission.exact_alarm,
      };
    } catch (error) {
      console.warn('[NotificationService] Erro ao consultar permissão:', error);
      return {
        granted: false,
        notificationGranted: false,
        exactAlarmGranted: false,
        canRequest: false,
        status: 'denied',
        exactAlarmStatus: 'denied',
      };
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
   * Abre a tela do Android que autoriza alarmes exatos para este aplicativo.
   */
  async openExactAlarmSettings() {
    if (Capacitor.getPlatform() !== 'android') return true;
    try {
      await LocalNotifications.changeExactNotificationSetting();
      return true;
    } catch (error) {
      console.warn('[NotificationService] Não foi possível abrir a configuração de alarmes exatos:', error);
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

  // Serializa cancelamento e agendamento para que a lista mais recente prevaleça.
  scheduleReadings(leituras = []) {
    const snapshot = leituras.map((leitura) => ({ ...leitura }));
    agendamentoEmFila = agendamentoEmFila.catch(() => {}).then(() => this._scheduleReadings(snapshot));
    return agendamentoEmFila;
  },

  /** Agenda até 25 dias com um resumo por horário (9h e 14h), no máximo 50 avisos. */
  async _scheduleReadings(leituras) {
    if (!Capacitor.isNativePlatform()) return true;

    try {
      // Não tenta agendar notificações se a permissão não estiver concedida
      const { granted } = await this.checkPermissionStatus();
      if (!granted) {
        return false;
      }

      await this.cancelAll();

      const leiturasNaoConcluidas = leituras
        .filter((leitura) => !leitura.completo)
        .map((leitura) => ({ leitura, dia: this._extractDay(leitura.diaLeitura) }))
        .filter(({ dia }) => dia >= 1 && dia <= 31);
      if (leiturasNaoConcluidas.length === 0) {
        return true;
      }

      const MAX_NOTIFICACOES_PENDENTES = 50;
      const notifications = [];
      const idsUtilizadosNoLote = new Set();
      const horariosAdicionados = new Set();
      const now = new Date();
      const hojeFormatado = dataCivilNotificacao(now);

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

      for (const notificacao of criarPlanoLembretes(leiturasNaoConcluidas, now)) {
        tentarAdicionar(notificacao);
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
      return true;
    } catch (error) {
      console.warn('[NotificationService] Falha ao agendar notificações:', error);
      return false;
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
