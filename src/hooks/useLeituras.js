import { useEffect, useMemo, useState } from 'react';
import {
  alternarStatusLeitura,
  atualizarCondominio,
  buscarCondominios,
  deletarCondominio,
  salvarCondominio,
} from '../services/condominioService';

const getCurrentMonthKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${year}-${month}`;
};

export const useLeituras = (onFeedback = () => {}) => {
  const diaAtual = new Date().getDate();
  const [leituras, setLeituras] = useState([]);

  useEffect(() => {
    let isMounted = true;

    buscarCondominios()
      .then((dados) => {
        if (isMounted) {
          setLeituras(dados);
        }
      })
      .catch((error) => {
        if (isMounted) {
          onFeedback(error.message, 'error');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [onFeedback]);

  const adicionarLeitura = async (novaLeitura) => {
    try {
      const leitura = await salvarCondominio(novaLeitura);
      setLeituras((previous) => [leitura, ...previous]);
      return leitura;
    } catch (error) {
      onFeedback(error.message, 'error');
      return null;
    }
  };

  const toggleCompleto = async (id) => {
    const leituraAnterior = leituras.find((item) => item.id === id);
    if (!leituraAnterior) {
      return;
    }

    setLeituras((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, completo: !item.completo } : item
      )
    );

    try {
      await alternarStatusLeitura(id, undefined, leituraAnterior.completo);
    } catch (error) {
      setLeituras((previous) =>
        previous.map((item) => (item.id === id ? leituraAnterior : item))
      );
      onFeedback(error.message, 'error');
    }
  };

  const deletarLeitura = async (id) => {
    const leituraAnterior = leituras.find((item) => item.id === id);
    setLeituras((previous) => previous.filter((item) => item.id !== id));

    try {
      await deletarCondominio(id);
    } catch (error) {
      if (leituraAnterior) {
        setLeituras((previous) => [leituraAnterior, ...previous]);
      }
      onFeedback(error.message, 'error');
    }
  };

  const editarLeitura = async (idTarget, novosDados) => {
    try {
      const leituraAtualizada = await atualizarCondominio(idTarget, novosDados);
      setLeituras((previous) =>
        previous.map((item) => (String(item.id) === String(idTarget) ? { ...item, ...leituraAtualizada } : item))
      );
      return true;
    } catch (error) {
      onFeedback(error.message, 'error');
      return false;
    }
  };

  const adicionarEmLote = async (novosCondominios) => {
    try {
      const leiturasSalvas = await Promise.all(novosCondominios.map((item) => salvarCondominio(item)));
      setLeituras((previous) => [...leiturasSalvas, ...previous]);
      return leiturasSalvas;
    } catch (error) {
      onFeedback(error.message, 'error');
      return [];
    }
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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return new Date(`${year}-${month}-01`).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }, []);

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
