export const atualizarBadgeIcone = (total) => {
  if ('setAppBadge' in navigator) {
    if (total > 0) {
      navigator.setAppBadge(total).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }
};
