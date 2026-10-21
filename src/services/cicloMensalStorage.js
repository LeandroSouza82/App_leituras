import { parseLeituraNumerica } from '../utils/leituraNumerica.js';

const PROPRIEDADES = { agua: 'leitura_anterior', gas: 'leitura_anterior_gas', energia: 'leitura_anterior_energia' };
const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
const PREFIXOS = ['valor_', 'concluido_', 'foto_path_', 'foto_directory_', 'foto_pendente_', 'temp_leituras_', 'fotos_temp_'];

const lerLista = (storage, key) => {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  const lista = JSON.parse(raw);
  if (!Array.isArray(lista)) throw new Error(`Dados locais inválidos: ${key}.`);
  return lista;
};

// A escrita do mês é o último passo. Um fechamento interrompido é retomado
// pelo diário, sem recalcular leituras a partir de um cache parcialmente limpo.
export const criarCicloMensalStorage = ({ storage, exigirConta, arquivar, enfileirar, gerarId, obterAnterior }) => {
  const emAndamento = new Map();
  const gravar = (key, value) => {
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error('Não foi possível confirmar a gravação do ciclo.');
  };

  const executar = async ({ condominio, mesAtual, manual = false }) => {
    const owner = exigirConta();
    if (!MES_VALIDO.test(mesAtual)) throw new Error('Mês do ciclo inválido.');
    const condId = String(condominio.id);
    const chaveCiclo = `ciclo_mensal_${condId}`;
    const chaveDiario = `ciclo_mensal_diario_${condId}`;
    const rawCiclo = storage.getItem(chaveCiclo);
    const ciclo = rawCiclo ? JSON.parse(rawCiclo) : null;
    if (ciclo && (ciclo.owner !== owner || !MES_VALIDO.test(ciclo.mes))) throw new Error('Conta ou mês do ciclo divergente.');
    if (ciclo && mesAtual < ciclo.mes) throw new Error('A data do aparelho está anterior ao ciclo salvo. Confira a data do celular.');

    let plano = storage.getItem(chaveDiario);
    plano = plano ? JSON.parse(plano) : null;
    if (!plano && !manual && (!ciclo || ciclo.mes === mesAtual)) {
      // As versões antigas não registravam o mês dos valores locais. Não
      // adivinhar esse período nem limpar dados na primeira instalação.
      if (!ciclo) gravar(chaveCiclo, JSON.stringify({ owner, mes: mesAtual, finalizado: false }));
      return { promovidas: 0, inicializado: !ciclo };
    }

    if (!plano) {
      const dados = {};
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (PREFIXOS.some(prefixo => key?.startsWith(`${prefixo}${condId}_`))) dados[key] = storage.getItem(key);
      }
      if (Object.entries(dados).some(([key, value]) => key.startsWith('foto_pendente_') && value === 'true')) {
        throw new Error('Há foto com leitura pendente de correção. Conclua essa leitura antes de iniciar o próximo mês.');
      }

      const mapa = new Map();
      for (const [key, value] of Object.entries(dados)) {
        if (!key.startsWith(`valor_${condId}_`)) continue;
        const identidade = key.slice(`valor_${condId}_`.length);
        const separador = identidade.lastIndexOf('_');
        const unidade = identidade.slice(0, separador);
        const servico = identidade.slice(separador + 1).toLowerCase();
        const valor = parseLeituraNumerica(value);
        if (separador < 1 || !PROPRIEDADES[servico] || valor === null || valor < 0) throw new Error(`Leitura inválida em ${identidade}. Os dados foram preservados.`);
        const id = JSON.stringify([unidade, servico]);
        if (mapa.has(id) && mapa.get(id).valor !== valor) throw new Error(`Leituras locais divergentes em ${unidade} (${servico}).`);
        mapa.set(id, { unidade, servico, valor });
      }
      for (const [key, value] of Object.entries(dados)) {
        if (key.startsWith(`concluido_${condId}_`) && value === 'true') {
          const identidade = key.slice(`concluido_${condId}_`.length);
          const separador = identidade.lastIndexOf('_');
          if (!mapa.has(JSON.stringify([identidade.slice(0, separador), identidade.slice(separador + 1).toLowerCase()]))) {
            throw new Error(`Unidade concluída sem leitura salva: ${identidade}.`);
          }
        }
      }

      const unificada = new Map();
      for (const item of lerLista(storage, `leituras_anteriores_${condId}`)) {
        if (!item?.unidade) throw new Error('Unidade inválida no histórico local.');
        const unidade = String(item.unidade).trim();
        unificada.set(unidade, { ...unificada.get(unidade), ...item, unidade });
      }
      const porServico = {};
      for (const servico of Object.keys(PROPRIEDADES)) {
        porServico[servico] = new Map(lerLista(storage, `leituras_anteriores_${condId}_${servico.toUpperCase()}`).map(item => [String(item.unidade).trim(), item]));
      }
      for (const { unidade, servico, valor } of mapa.values()) {
        const propriedade = PROPRIEDADES[servico];
        const item = unificada.get(unidade) || { unidade };
        const anterior = obterAnterior ? obterAnterior(condId, unidade, servico)
          : parseLeituraNumerica(item[propriedade] ?? porServico[servico].get(unidade)?.leitura_anterior);
        if (anterior !== null && Math.round(valor * 10000) < Math.round(anterior * 10000)) throw new Error(`A leitura de ${unidade} (${servico}) é menor que a anterior. Corrija antes de finalizar o ciclo.`);
        unificada.set(unidade, { ...item, [propriedade]: valor });
        porServico[servico].set(unidade, { ...porServico[servico].get(unidade), unidade, leitura_anterior: valor });
      }
      const lotes = Object.entries(porServico).filter(([servico]) => [...mapa.values()].some(item => item.servico === servico))
        .map(([servico, lista]) => ({ servico: servico.toUpperCase(), leituras: [...lista.values()].map(({ unidade, leitura_anterior }) => ({ unidade, leitura_anterior })) }));
      plano = {
        owner, condId, origem: ciclo?.mes || mesAtual, destino: mesAtual, id: gerarId(),
        condominio, dados, promovidas: mapa.size, lotes, incluirLegado: !ciclo?.finalizado,
        unificada: [...unificada.values()].map(({ leitura_atual, ...item }) => item),
      };
      gravar(chaveDiario, JSON.stringify(plano));
    }

    if (plano.owner !== owner || plano.condId !== condId || !MES_VALIDO.test(plano.destino)) throw new Error('O fechamento pendente pertence a outro ciclo ou conta.');
    await arquivar(plano); // Confirma cópias das fotos e relatório antes de qualquer limpeza.
    exigirConta(owner);
    let alterado = false;
    for (const [key, value] of Object.entries(plano.dados)) {
      // Não apagar uma captura ou edição que apareceu durante o backup.
      const atual = storage.getItem(key);
      if (atual !== value && !(plano.aplicando && atual === null)) alterado = true;
    }
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (PREFIXOS.some(prefixo => key?.startsWith(`${prefixo}${condId}_`)) && !(key in plano.dados)) alterado = true;
    }
    if (alterado) {
      // Nenhum valor foi promovido se o plano ainda não entrou em aplicação.
      // Replanejar na próxima tentativa sem descartar as edições concorrentes.
      if (!plano.aplicando) storage.removeItem(chaveDiario);
      throw new Error('Uma leitura foi alterada durante o fechamento. Os dados foram preservados; tente novamente.');
    }
    for (const lote of plano.lotes) {
      enfileirar(condId, lote.leituras, lote.servico, { userId: owner, mesReferencia: plano.destino });
    }
    plano.aplicando = true;
    gravar(chaveDiario, JSON.stringify(plano));
    gravar(`leituras_anteriores_${condId}`, JSON.stringify(plano.unificada));
    for (const lote of plano.lotes) gravar(`leituras_anteriores_${condId}_${lote.servico}`, JSON.stringify(lote.leituras));
    for (const key of Object.keys(plano.dados)) {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw new Error('Falha ao limpar o ciclo. Os dados estão no backup.');
    }
    gravar(chaveCiclo, JSON.stringify({ owner, mes: plano.destino, finalizado: true }));
    storage.removeItem(chaveDiario);
    if (storage.getItem(chaveDiario) !== null) throw new Error('Não foi possível confirmar o término do fechamento. Tente novamente.');
    if (plano.destino < mesAtual) return executar({ condominio, mesAtual });
    return { promovidas: plano.promovidas, finalizado: true };
  };

  return {
    processar(options) {
      const key = String(options.condominio.id);
      if (emAndamento.has(key)) return emAndamento.get(key);
      const promise = executar(options).finally(() => emAndamento.delete(key));
      emAndamento.set(key, promise);
      return promise;
    },
  };
};
