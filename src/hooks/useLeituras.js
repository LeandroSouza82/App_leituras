import { useEffect, useMemo, useState } from 'react';
import { getLastSessionMonth, getLeituras, saveLeituras, setLastSessionMonth } from '../services/storageService';

const getCurrentMonthKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${year}-${month}`;
};

const gerarIdUnico = () => Date.now() + Math.random().toString(36).substr(2, 9);

const createLeitura = ({ nome, data, apartamentos, valor, diaLeitura, tipoLeitura, endereco, instrucoesAcesso, contatoSindico }) => ({
  id: gerarIdUnico(),
  nome,
  data: data || new Date().toISOString().split('T')[0],
  apartamentos: Number(apartamentos),
  valor: Number(valor),
  diaLeitura: Number(diaLeitura),
  tipoLeitura: tipoLeitura && tipoLeitura.trim() ? tipoLeitura.trim() : 'Água e Gás',
  endereco: endereco || '',
  instrucoesAcesso: instrucoesAcesso || '',
  contatoSindico: contatoSindico || '',
  completo: false,
});

const normalizeLeitura = (item) => ({
  ...item,
  id: item.id || gerarIdUnico(),
  tipoLeitura: item.tipoLeitura && String(item.tipoLeitura).trim() ? String(item.tipoLeitura).trim() : 'Água e Gás',
  endereco: item.endereco || '',
  instrucoesAcesso: item.instrucoesAcesso || '',
  contatoSindico: item.contatoSindico || '',
  completo: typeof item.completo === 'boolean' ? item.completo : false,
});

export const useLeituras = () => {
  const chaveMesAno = getCurrentMonthKey();
  const diaAtual = new Date().getDate();

  const [leituras, setLeituras] = useState(() => {
    const storedLeituras = getLeituras(chaveMesAno).map(normalizeLeitura);
    const ultimaSessao = getLastSessionMonth();

    if (ultimaSessao && ultimaSessao !== chaveMesAno) {
      const leiturasDoMesAnterior = getLeituras(ultimaSessao).map(normalizeLeitura);
      const fonteLeituras = leiturasDoMesAnterior.length > 0 ? leiturasDoMesAnterior : storedLeituras;
      const resetLeituras = fonteLeituras.map((item) => ({ ...normalizeLeitura(item), completo: false }));
      saveLeituras(chaveMesAno, resetLeituras);
      setLastSessionMonth(chaveMesAno);
      return resetLeituras;
    }

    if (!ultimaSessao) {
      setLastSessionMonth(chaveMesAno);
    }

    return storedLeituras;
  });

  useEffect(() => {
    saveLeituras(chaveMesAno, leituras);
  }, [chaveMesAno, leituras]);

  const adicionarLeitura = (novaLeitura) => {
    const leitura = createLeitura(novaLeitura);
    setLeituras((previous) => [leitura, ...previous]);
  };

  const toggleCompleto = (id) => {
    setLeituras((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, completo: !item.completo } : item
      )
    );
  };

  const deletarLeitura = (id) => {
    setLeituras((previous) => previous.filter((item) => item.id !== id));
  };

  const editarLeitura = (idTarget, novosDados) => {
    setLeituras((prev) =>
      prev.map((item) =>
        String(item.id) === String(idTarget)
          ? { ...item, ...novosDados }
          : item
      )
    );
  };

  const adicionarEmLote = (novosCondominios) => {
    const leiturasConvertidas = novosCondominios.map((item) =>
      createLeitura({
        nome: item.nome,
        apartamentos: item.apartamentos,
        valor: item.valor,
        diaLeitura: item.diaLeitura,
        tipoLeitura: item.tipoLeitura,
        endereco: item.endereco,
        instrucoesAcesso: item.instrucoesAcesso,
        contatoSindico: item.contatoSindico,
      })
    );

    setLeituras((previous) => [...leiturasConvertidas, ...previous]);
  };

  const leiturasHoje = useMemo(
    () => leituras.filter((item) => !item.completo && Number(item.diaLeitura) === diaAtual),
    [leituras, diaAtual]
  );

  const leiturasAtrasadas = useMemo(
    () => leituras.filter((item) => !item.completo && Number(item.diaLeitura) < diaAtual),
    [leituras, diaAtual]
  );

  const totalValor = useMemo(
    () => leituras.reduce((sum, item) => sum + Number(item.valor), 0),
    [leituras]
  );

  const totalConcluidos = useMemo(
    () => leituras.filter((item) => item.completo).length,
    [leituras]
  );

  const percentualConcluido = useMemo(() => {
    if (leituras.length === 0) {
      return 0;
    }
    return Math.round((totalConcluidos / leituras.length) * 100);
  }, [leituras.length, totalConcluidos]);

  const mesAnoFormatado = useMemo(() => {
    const [month, year] = chaveMesAno.split('-');
    return new Date(`${year}-${month}-01`).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }, [chaveMesAno]);

  return {
    leituras,
    mesAnoFormatado,
    totalValor,
    totalConcluidos,
    percentualConcluido,
    leiturasHoje,
    leiturasAtrasadas,
    adicionarLeitura,
    adicionarEmLote,
    toggleCompleto,
    deletarLeitura,
    editarLeitura,
  };
};
