import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './LeituraList.css';
import LeituraItem from '../LeituraItem/LeituraItem';
import AlertaBanner from '../AlertaBanner/AlertaBanner';
import { Search } from 'lucide-react';

// Extrai o primeiro número de um texto de dia (ex: "7 a 10" → 7, "Variado" → null)
const extrairNumeroDia = (diaTexto) => {
  if (!diaTexto) return null;
  const numeroString = String(diaTexto).match(/\d+/)?.[0];
  return numeroString ? Number.parseInt(numeroString, 10) : null;
};

// Normaliza o texto removendo acentos, espaços desnecessários e convertendo para minúsculas
const normalizarTexto = (texto) => {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const LeituraList = ({
  leituras,
  leiturasHoje,
  leiturasAmanha,
  leiturasAtrasadas,
  onToggle,
  onDelete,
  onEdit,
  focarAtrasadoAuto,
  focoLeituraTipo = 'atrasadas',
  focoEspecifico = null,
  onResetFocoEspecifico,
  onResetFocarAtrasadoAuto,
}) => {
  const diaAtual = new Date().getDate();
  const ultimoDiaDoMes = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(), []);
  const [indicesAtuaisDoFoco, setIndicesAtuaisDoFoco] = useState({
    atrasadas: 0,
    amanha: 0,
    hoje: 0,
  });
  const [itemFocadoId, setItemFocadoId] = useState(null);
  const [tipoFocoAtivo, setTipoFocoAtivo] = useState('atrasadas');
  const [filtroCondominio, setFiltroCondominio] = useState('');
  const itemRefs = useRef({});

  // 1. Ordenação dos dados
  const leiturasOrdenadas = useMemo(() => {
    return [...leituras].sort((a, b) => {
      const diaA = extrairNumeroDia(a.diaLeitura) || Infinity;
      const diaB = extrairNumeroDia(b.diaLeitura) || Infinity;
      return diaA - diaB;
    });
  }, [leituras]);

  // 2. Filtro dos dados em tempo real
  const leiturasFiltradas = useMemo(() => {
    const termoBusca = normalizarTexto(filtroCondominio).trim();
    if (!termoBusca) return leiturasOrdenadas;

    return leiturasOrdenadas.filter((item) => {
      const valoresParaVerificar = [
        item.nome,
        item.condominio,
        item.nome_condominio,
        item.descricao,
        item.titulo,
        item.condominio?.nome
      ];

      return valoresParaVerificar.some((valor) =>
        normalizarTexto(valor).includes(termoBusca)
      );
    });
  }, [leiturasOrdenadas, filtroCondominio]);

  // 3. Análise de Dados: Mapeia apenas os índices dos itens com status "Atrasado" na lista filtrada
  const indicesAtrasados = useMemo(() => {
    const indices = [];
    leiturasFiltradas.forEach((item, index) => {
      const dia = extrairNumeroDia(item.diaLeitura);
      if (!item.completo && dia !== null && dia < diaAtual) {
        indices.push(index);
      }
    });
    return indices;
  }, [leiturasFiltradas, diaAtual]);

  const indicesAmanha = useMemo(() => {
    const indices = [];
    leiturasFiltradas.forEach((item, index) => {
      const dia = extrairNumeroDia(item.diaLeitura);
      if (!item.completo && dia !== null && diaAtual < ultimoDiaDoMes && dia === diaAtual + 1) {
        indices.push(index);
      }
    });
    return indices;
  }, [leiturasFiltradas, diaAtual, ultimoDiaDoMes]);

  const indicesHoje = useMemo(() => {
    const indices = [];
    leiturasFiltradas.forEach((item, index) => {
      const dia = extrairNumeroDia(item.diaLeitura);
      if (!item.completo && dia !== null && dia === diaAtual) {
        indices.push(index);
      }
    });
    return indices;
  }, [leiturasFiltradas, diaAtual]);

  // 4. Lógica de Scroll e Destaque cíclico por categoria
  const handleFocarAtrasado = useCallback((tipo = 'atrasadas') => {
    const indicesPorTipo = {
      atrasadas: indicesAtrasados,
      amanha: indicesAmanha,
      hoje: indicesHoje,
    };
    const tipoNormalizado = indicesPorTipo[tipo] ? tipo : 'atrasadas';
    let indicesAlvo = indicesPorTipo[tipoNormalizado] || indicesAtrasados;
    if (!indicesAlvo || indicesAlvo.length === 0) {
      indicesAlvo = leiturasFiltradas
        .map((item, index) => (!item.completo ? index : null))
        .filter((i) => i !== null);
    }

    if (!indicesAlvo || indicesAlvo.length === 0) {
      return;
    }

    const indiceAtual = indicesAtuaisDoFoco[tipoNormalizado] || 0;
    const idx = indiceAtual % indicesAlvo.length;
    const targetIndex = indicesAlvo[idx];
    const targetItem = leiturasFiltradas[targetIndex];

    if (targetItem && itemRefs.current[targetItem.id]) {
      const element = itemRefs.current[targetItem.id];
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      setItemFocadoId(targetItem.id);
      setTipoFocoAtivo(tipoNormalizado);
      setTimeout(() => {
        setItemFocadoId(null);
        setTipoFocoAtivo(null);
      }, 2500);
    }

    setIndicesAtuaisDoFoco((prev) => ({
      ...prev,
      [tipoNormalizado]: (indiceAtual + 1) % indicesAlvo.length,
    }));
  }, [indicesAmanha, indicesAtrasados, indicesHoje, indicesAtuaisDoFoco, leiturasFiltradas]);

  useEffect(() => {
    if (focarAtrasadoAuto) {
      const timer = setTimeout(() => {
        // Se houver um condomínio específico apontado por notificação
        if (focoEspecifico?.id) {
          const targetIndex = leiturasFiltradas.findIndex(
            (item) => item.id === focoEspecifico.id || String(item.id) === String(focoEspecifico.id)
          );

          if (targetIndex !== -1) {
            const targetItem = leiturasFiltradas[targetIndex];
            if (itemRefs.current[targetItem.id]) {
              itemRefs.current[targetItem.id].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }

            const diaTarget = extrairNumeroDia(targetItem.diaLeitura);
            const isAtrasadoTarget = !targetItem.completo && diaTarget !== null && diaTarget < diaAtual;
            const isHojeTarget = !targetItem.completo && diaTarget !== null && diaTarget === diaAtual;
            const tipoFocoCalculado = isAtrasadoTarget
              ? 'atrasadas'
              : isHojeTarget
              ? 'hoje'
              : (focoEspecifico.tipo || 'amanha');

            setItemFocadoId(targetItem.id);
            setTipoFocoAtivo(tipoFocoCalculado);
            setTimeout(() => {
              setItemFocadoId(null);
              setTipoFocoAtivo(null);
            }, 2500);

            onResetFocoEspecifico?.();
            if (onResetFocarAtrasadoAuto) {
              onResetFocarAtrasadoAuto();
            }
            return;
          }
        }

        // Fallback: ciclo por categoria
        handleFocarAtrasado(focoEspecifico?.tipo || focoLeituraTipo);
        onResetFocoEspecifico?.();
        if (onResetFocarAtrasadoAuto) {
          onResetFocarAtrasadoAuto();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [focarAtrasadoAuto, focoEspecifico, focoLeituraTipo, handleFocarAtrasado, leiturasFiltradas, diaAtual, onResetFocoEspecifico, onResetFocarAtrasadoAuto]);

  return (
    <section className="list-card">
      <div className="list-sticky-top">
        <div className="list-header">
          <div className="list-header-text">
            <h2>Leituras do mês</h2>
            <p>Gerencie os condomínios cadastrados.</p>
          </div>
        </div>

        {/* Campo de busca DENTRO do cabeçalho azul */}
        <div className="busca-container">
          <div className="busca-wrapper">
            <Search size={16} className="busca-icon" />
            <input
              type="text"
              placeholder="Buscar condomínio..."
              value={filtroCondominio}
              onChange={(e) => setFiltroCondominio(e.target.value)}
              className="busca-input"
            />
          </div>
        </div>

        <AlertaBanner
          leiturasHoje={leiturasHoje}
          leiturasAmanha={leiturasAmanha}
          leiturasAtrasadas={leiturasAtrasadas}
          onFocarAtrasado={handleFocarAtrasado}
        />
      </div>

      {leituras.length === 0 ? (
        <div className="empty-state">
          Nenhuma leitura adicionada ainda. Comece a adicionar seus condomínios!
        </div>
      ) : (
        <>
          {leiturasFiltradas.length === 0 ? (
            <div className="empty-state">
              Nenhum condomínio encontrado com "{filtroCondominio}".
            </div>
          ) : (
            <div className="list-items">
              {leiturasFiltradas.map((item) => (
                <div key={item.id} ref={(el) => (itemRefs.current[item.id] = el)}>
                  <LeituraItem
                    leitura={item}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    isFocused={itemFocadoId === item.id}
                    focoTipo={tipoFocoAtivo}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default LeituraList;
