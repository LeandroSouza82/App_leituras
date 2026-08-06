export const showLeituraNotifications = ({ leiturasHoje = [], leiturasAtrasadas = [] }) => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return;
  }

  if (Notification.permission === 'granted') {
    const mensagem = [
      leiturasHoje.length > 0 ? `${leiturasHoje.length} leitura(s) para hoje` : null,
      leiturasAtrasadas.length > 0 ? `${leiturasAtrasadas.length} leitura(s) atrasada(s)` : null,
    ]
      .filter(Boolean)
      .join(' e ');

    if (mensagem) {
      new Notification('Alertas de leitura', { body: mensagem });
    }
    return;
  }

  if (Notification.permission !== 'denied') {
    Notification.requestPermission().catch(() => {});
  }
};
