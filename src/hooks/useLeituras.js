import { useEffect, useMemo, useState } from 'react';
import {
  alternarStatusLeitura,
  atualizarCondominio,
  buscarCondominios,
  deletarCondominio,
  salvarCondominio,
} from '../services/condominioService';
import { NotificationService } from '../services/notificationService';
import { useDataLeituras } from './useDataLeituras';
import { getCurrentMonthKey, leiturasParaMes } from '../utils/mesLeituras';

// Extrai o primeiro número de um texto de dia (ex: "7 a 10" → 7, "Variado" → null)
const extrairNumeroDia = (diaTexto) => {
  if (!diaTexto) return null;
  const numeroString = String(diaTexto).match(/\d+/)?.[0];
  return numeroString ? Number.parseInt(numeroString, 10) : null;
};

const aplicarMesAtual = (dados, mesReferencia) => {
  let pendencias = [];
  try {
    const fila = JSON.parse(localStorage.getItem('pendencias_offline') || '[]');
    if (Array.isArray(fila)) pendencias = fila;
  } catch (error) {
    console.warn('Erro ao ler marcações offline', error);
  }
  return leiturasParaMes(dados, mesReferencia, pendencias);
};

export const useLeituras = (onFeedback = () => {}) => {
  const dataAtual = useDataLeituras();
  const mesReferencia = getCurrentMonthKey(dataAtual);
  const diaAtual = dataAtual.getDate();
  const ultimoDiaDoMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0).getDate();
  const [dadosLeituras, setLeituras] = useState([]);
  const [cacheCarregado, setCacheCarregado] = useState(false);
  const leituras = useMemo(
    () => leiturasParaMes(dadosLeituras, mesReferencia),
    [dadosLeituras, mesReferencia]
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    // 1. CARREGAMENTO INSTANTÂNEO OFF-LINE (CACHE)
    try {
      const cachedData = localStorage.getItem('condominios_cache');
      if (cachedData && isMounted) {
        setLeituras(aplicarMesAtual(JSON.parse(cachedData), mesReferencia));
      }
    } catch (e) {
      console.warn("Erro ao ler cache local de condominios", e);
    }
    setCacheCarregado(true);

    // 2. BUSCA EM BACKGROUND NO SUPABASE (Silenciosa)
    buscarCondominios(mesReferencia)
      .then((dados) => {
        if (isMounted) {
          const atuais = aplicarMesAtual(dados, mesReferencia);
          setLeituras(atuais);
          localStorage.setItem('condominios_cache', JSON.stringify(atuais));
        }
      })
      .catch((error) => {
        // Se houver erro de rede, mas já temos cache, silencie o erro para não travar a UI
        if (isMounted) {
          const hasCache = !!localStorage.getItem('condominios_cache');
          if (!hasCache) {
             onFeedback(error.message, 'error');
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [onFeedback, reloadKey, mesReferencia]);

  useEffect(() => {
    if (!cacheCarregado) return;
    try {
      const cache = JSON.parse(localStorage.getItem('condominios_cache') || '[]');
      const porId = new Map(cache.map((item) => [String(item.id), item]));
      // Persiste apenas a marcação mensal, preservando edições locais de outros campos.
      const atualizados = leituras.map((item) => ({
        ...(porId.get(String(item.id)) || item),
        completo: item.completo,
        mesReferencia: item.mesReferencia,
      }));
      localStorage.setItem('condominios_cache', JSON.stringify(atualizados));
    } catch (error) {
      console.warn('Erro ao salvar cache local de condomínios', error);
    }
  }, [leituras, cacheCarregado]);

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
    // Fixa o mês do toque, mesmo que a resposta chegue depois da meia-noite.
    const mesDoToque = getCurrentMonthKey();
    const leituraAnterior = aplicarMesAtual(dadosLeituras, mesDoToque).find((item) => item.id === id);
    if (!leituraAnterior) {
      return;
    }

    const novoCompleto = !leituraAnterior.completo;

    if (novoCompleto) {
      await NotificationService.cancelForLeitura(id);
    }

    setLeituras((previous) =>
      previous.map((item) =>
        item.id === id && getCurrentMonthKey() === mesDoToque
          ? { ...item, completo: novoCompleto, mesReferencia: mesDoToque } : item
      )
    );

    try {
      await alternarStatusLeitura(id, mesDoToque, leituraAnterior.completo);
    } catch (error) {
      const mensagemErro = error?.message || '';
      const falhaDeRede = mensagemErro.includes('Failed to fetch') || !navigator.onLine;

      if (falhaDeRede) {

        try {
          const pendencias = JSON.parse(localStorage.getItem('pendencias_offline') || '[]');
          pendencias.push({
            id,
            completo: novoCompleto,
            mes_referencia: mesDoToque,
            data: new Date().toISOString(),
          });
          localStorage.setItem('pendencias_offline', JSON.stringify(pendencias));
        } catch (storageError) {
        }

        return;
      }

      setLeituras((previous) =>
        previous.map((item) => (item.id === id && getCurrentMonthKey() === mesDoToque ? leituraAnterior : item))
      );
      onFeedback(error.message, 'error');
    }
  };

  const deletarLeitura = async (id) => {
    await NotificationService.cancelForLeitura(id);
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
    await NotificationService.cancelForLeitura(idTarget);
    try {
      // 1. Sincronização direta com o Supabase (garantia de salvamento)
      const leituraAtualizada = await atualizarCondominio(idTarget, novosDados);

      // 2. Atualização da Interface Pós-Sucesso (Forçando a entrada dos novosDados incluindo os nulls)
      setLeituras((previous) =>
        previous.map((item) => (String(item.id) === String(idTarget) ? { ...item, ...leituraAtualizada, ...novosDados } : item))
      );

      // 3. Atualização no Cache Local para refletir a nova verdade
      try {
        const cache = JSON.parse(localStorage.getItem('condominios_cache') || '[]');
        const novoCache = cache.map(c => String(c.id) === String(idTarget) ? { ...c, ...leituraAtualizada, ...novosDados } : c);
        localStorage.setItem('condominios_cache', JSON.stringify(novoCache));
      } catch (e) {
        console.warn('Erro ao atualizar cache local após edição', e);
      }

      return true;
    } catch (error) {
      console.error('Erro ao editar condomínio:', error);
      onFeedback('Não foi possível salvar as alterações. Verifique sua conexão e tente novamente.', 'error');
      return false;
    }
  };

  const leiturasHoje = useMemo(
    () => leituras.filter((item) => {
      if (item.completo) return false;
      const dia = extrairNumeroDia(item.diaLeitura);
      return dia === diaAtual;
    }),
    [leituras, diaAtual]
  );

  const leiturasAmanha = useMemo(
    () => leituras.filter((item) => {
      if (item.completo) return false;
      const dia = extrairNumeroDia(item.diaLeitura);
      return dia !== null && diaAtual < ultimoDiaDoMes && dia === diaAtual + 1;
    }),
    [leituras, diaAtual, ultimoDiaDoMes]
  );

  const leiturasAtrasadas = useMemo(
    () => leituras.filter((item) => {
      if (item.completo) return false;
      const dia = extrairNumeroDia(item.diaLeitura);
      return dia !== null && dia < diaAtual;
    }),
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
    const [year, month] = mesReferencia.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }, [mesReferencia]);

  const recarregarCondominios = () => {
    setReloadKey((previous) => previous + 1);
  };

  return {
    leituras,
    mesAnoFormatado,
    totalValor,
    totalConcluidos,
    percentualConcluido,
    leiturasHoje,
    leiturasAmanha,
    leiturasAtrasadas,
    adicionarLeitura,
    toggleCompleto,
    deletarLeitura,
    editarLeitura,
    recarregarCondominios,
  };
};
