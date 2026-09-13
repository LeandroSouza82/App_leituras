import { useEffect, useMemo, useState } from 'react';
import {
  alternarStatusLeitura,
  atualizarCondominio,
  buscarCondominios,
  deletarCondominio,
  salvarCondominio,
} from '../services/condominioService';
import { NotificationService } from '../services/notificationService';

// Extrai o primeiro número de um texto de dia (ex: "7 a 10" → 7, "Variado" → null)
const extrairNumeroDia = (diaTexto) => {
  if (!diaTexto) return null;
  const numeroString = String(diaTexto).match(/\d+/)?.[0];
  return numeroString ? Number.parseInt(numeroString, 10) : null;
};

const getCurrentMonthKey = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${year}-${month}`;
};

export const useLeituras = (onFeedback = () => {}) => {
  const diaAtual = new Date().getDate();
  const ultimoDiaDoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const [leituras, setLeituras] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    // 1. CARREGAMENTO INSTANTÂNEO OFF-LINE (CACHE)
    try {
      const cachedData = localStorage.getItem('condominios_cache');
      if (cachedData && isMounted) {
        setLeituras(JSON.parse(cachedData));
      }
    } catch (e) {
      console.warn("Erro ao ler cache local de condominios", e);
    }

    // 2. BUSCA EM BACKGROUND NO SUPABASE (Silenciosa)
    buscarCondominios()
      .then((dados) => {
        if (isMounted) {
          setLeituras(dados);
          localStorage.setItem('condominios_cache', JSON.stringify(dados));
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
  }, [onFeedback, reloadKey]);

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

    const novoCompleto = !leituraAnterior.completo;

    if (novoCompleto) {
      await NotificationService.cancelForLeitura(id);
    }

    setLeituras((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, completo: novoCompleto } : item
      )
    );

    try {
      await alternarStatusLeitura(id, undefined, leituraAnterior.completo);
    } catch (error) {
      const mensagemErro = error?.message || '';
      const falhaDeRede = mensagemErro.includes('Failed to fetch') || !navigator.onLine;

      if (falhaDeRede) {

        try {
          const pendencias = JSON.parse(localStorage.getItem('pendencias_offline') || '[]');
          pendencias.push({
            id,
            completo: novoCompleto,
            mes_referencia: getCurrentMonthKey(),
            data: new Date().toISOString(),
          });
          localStorage.setItem('pendencias_offline', JSON.stringify(pendencias));
        } catch (storageError) {
        }

        return;
      }

      setLeituras((previous) =>
        previous.map((item) => (item.id === id ? leituraAnterior : item))
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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return new Date(`${year}-${month}-01`).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }, []);

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
