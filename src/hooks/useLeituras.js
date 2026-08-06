import { useEffect, useMemo, useState } from 'react';
import { getLastSessionMonth, getLeituras, saveLeituras, setLastSessionMonth } from '../services/storageService';

const getCurrentMonthKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${year}-${month}`;
};

const createLeitura = ({ nome, data, apartamentos, valor, diaLeitura }) => ({
  id: Date.now(),
  nome,
  data,
  apartamentos: Number(apartamentos),
  valor: Number(valor),
  diaLeitura: Number(diaLeitura),
  completo: false,
});

export const useLeituras = () => {
  const chaveMesAno = getCurrentMonthKey();

  const [leituras, setLeituras] = useState(() => {
    const storedLeituras = getLeituras(chaveMesAno);
    const ultimaSessao = getLastSessionMonth();

    if (ultimaSessao && ultimaSessao !== chaveMesAno) {
      const resetLeituras = storedLeituras.map((item) => ({ ...item, completo: false }));
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
    adicionarLeitura,
    toggleCompleto,
    deletarLeitura,
  };
};
