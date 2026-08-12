import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * NotificationService - Serviço modular para gerenciar notificações locais e alarmes agendados.
 */
export const NotificationService = {
  /**
   * Solicita permissão para enviar notificações.
   */
  async requestPermissions() {
    if (Capacitor.isNativePlatform()) {
      const permission = await LocalNotifications.requestPermissions();
      return permission.display === 'granted';
    }
    return false;
  },

  /**
   * Cancela todas as notificações pendentes.
   */
  async cancelAll() {
    if (!Capacitor.isNativePlatform()) return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending);
    }
  },

  /**
   * Agenda notificações para uma lista de leituras pendentes ou atrasadas.
   * @param {Array} leituras - Lista de objetos de leitura.
   */
  async scheduleReadings(leituras = []) {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await this.cancelAll();

      const notifications = [];
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      leituras.forEach((leitura, index) => {
        if (leitura.completo) return;

        const dia = this._extractDay(leitura.diaLeitura);
        if (!dia) return;

        // Criar data para a notificação (hoje ou no dia agendado)
        let scheduleDate = new Date(currentYear, currentMonth, dia, 8, 0, 0); // 08:00 AM

        // Se o dia já passou (atrasado), notifica imediatamente (ou em 1 minuto)
        if (scheduleDate < now) {
          scheduleDate = new Date(Date.now() + (index + 1) * 5000); // Espaçado por 5 segundos
        }

        notifications.push({
          title: '⚠️ Condomínio com Leitura Pendente',
          body: `O condomínio ${leitura.nome} aguarda leitura.`,
          id: index + 100,
          schedule: { at: scheduleDate },
          sound: 'default',
          attachments: null,
          actionTypeId: '',
          extra: { id: leitura.id }
        });
      });

      if (notifications.length > 0) {
        await LocalNotifications.schedule({
          notifications: notifications.slice(0, 50) // Capacitor tem limite de notificações agendadas
        });
      }
    } catch (error) {
      console.error('Erro ao agendar notificações:', error);
    }
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
