export const HORARIOS_LEMBRETE = [9, 14];

export const dataCivilNotificacao = (data) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

// Mantém os horários futuros e, ao abrir o app, recupera apenas o último
// horário vencido de hoje que ainda não foi registrado.
export const expandirHorariosNotificacao = (notificacao, agora, registradosHoje) => {
  const dataBase = notificacao.schedule.at;
  const dia = dataCivilNotificacao(dataBase);
  const hoje = dataCivilNotificacao(agora);
  const identidade = notificacao.extra?.id ?? `agrupada:${notificacao.extra?.focusType}`;
  const horarios = HORARIOS_LEMBRETE.map((hora) => {
    const at = new Date(dataBase);
    at.setHours(hora, 0, 0, 0);
    return { hora, at, chave: `${identidade}:${dia}:${hora}`, hoje: dia === hoje };
  });
  const vencidos = horarios.filter(({ at }) => at <= agora);
  const ultimoVencido = vencidos[vencidos.length - 1];

  return horarios.flatMap((horario) => {
    if (horario.at > agora) return [horario];
    if (!horario.hoje || horario !== ultimoVencido || registradosHoje.has(horario.chave)) return [];
    return [{ ...horario, at: new Date(agora.getTime() + 5000) }];
  });
};
