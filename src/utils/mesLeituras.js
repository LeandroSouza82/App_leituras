export const getCurrentMonthKey = (data = new Date()) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;

// O status pertence ao mês; os demais dados do condomínio são preservados.
export const leiturasParaMes = (leituras, mesReferencia, pendencias = []) => {
  const statusPendentes = new Map();
  for (const item of pendencias) {
    if (item.mes_referencia === mesReferencia && typeof item.completo === 'boolean') {
      statusPendentes.set(String(item.id), item.completo);
    }
  }
  return leituras.map((item) => ({
    ...item,
    mesReferencia,
    completo: statusPendentes.has(String(item.id))
      ? statusPendentes.get(String(item.id))
      : item.mesReferencia === mesReferencia && Boolean(item.completo),
  }));
};
