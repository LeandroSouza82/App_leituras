// Recebe os condomínios já associados ao mês ativo pelo useLeituras.
export const calcularTotalFaturado = (leituras) => leituras.reduce((centavos, item) => {
  if (!item.completo) return centavos;
  const valor = Number(item.valor);
  return Number.isFinite(valor) ? centavos + Math.round(valor * 100) : centavos;
}, 0) / 100;
