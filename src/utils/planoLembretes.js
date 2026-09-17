export const DIAS_COBERTURA_LEMBRETES = 25;

const textos = {
  atrasadas: { title: '🚨 Leitura continua atrasada', body: (nome) => `A leitura do condomínio ${nome} ainda não foi concluída.` },
  hoje: { title: '🚨 Leitura deve ser realizada hoje', body: (nome) => `A leitura do condomínio ${nome} está programada para hoje.` },
  amanha: { title: '⏰ Leitura vence amanhã', body: (nome) => `A leitura do condomínio ${nome} deve ser realizada amanhã.` },
};

// Recebe dias já interpretados pelo serviço. As datas de vencimento permanecem
// vinculadas ao ciclo atual, inclusive quando a cobertura atravessa o mês.
export const criarPlanoLembretes = (leiturasComDia, agora) => {
  const pendentes = leiturasComDia.map(({ leitura, dia }) => ({
    leitura,
    vencimento: new Date(agora.getFullYear(), agora.getMonth(), dia),
  }));
  const plano = [];
  for (let offset = 0; offset < DIAS_COBERTURA_LEMBRETES; offset++) {
    const data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + offset);
    const amanha = new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1);
    const grupos = { atrasadas: [], hoje: [], amanha: [] };
    for (const { leitura, vencimento } of pendentes) {
      if (vencimento < data) grupos.atrasadas.push(leitura);
      else if (+vencimento === +data) grupos.hoje.push(leitura);
      else if (+vencimento === +amanha) grupos.amanha.push(leitura);
    }
    const envolvidos = Object.values(grupos).flat();
    if (!envolvidos.length) continue;
    const focusType = Object.keys(grupos).find((tipo) => grupos[tipo].length);
    const individual = envolvidos.length === 1 ? envolvidos[0] : null;
    const resumo = [
      grupos.atrasadas.length && `${grupos.atrasadas.length} leitura(s) atrasada(s)`,
      grupos.hoje.length && `${grupos.hoje.length} para hoje`,
      grupos.amanha.length && `${grupos.amanha.length} para amanhã`,
    ].filter(Boolean).join(', ');
    plano.push({
      title: individual ? textos[focusType].title : '🔔 Lembrete de leituras',
      body: individual ? textos[focusType].body(individual.nome) : `Você tem ${resumo}. Toque para ver as leituras.`,
      schedule: { at: new Date(data.getFullYear(), data.getMonth(), data.getDate(), 9), allowWhileIdle: true },
      sound: 'default',
      extra: {
        ...(individual ? { id: individual.id } : {}),
        leituraIds: envolvidos.map((leitura) => String(leitura.id)),
        scheduleKey: 'resumo-leituras',
        focusType,
      },
    });
  }
  return plano;
};
