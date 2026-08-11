import { useEffect, useMemo, useRef, useState } from 'react';
import './LeituraList.css';
import LeituraItem from '../LeituraItem/LeituraItem';
import AlertaBanner from '../AlertaBanner/AlertaBanner';

const LeituraList = ({
  leituras,
  leiturasHoje,
  leiturasAtrasadas,
  onToggle,
  onDelete,
  onEdit,
  focarAtrasadoAuto,
  onResetFocarAtrasadoAuto,
}) => {
  const diaAtual = new Date().getDate();
  const [indiceAtualDoFoco, setIndiceAtualDoFoco] = useState(0);
  const [itemFocadoId, setItemFocadoId] = useState(null);
  const itemRefs = useRef({});

  // 1. Ordenação dos dados
  const leiturasOrdenadas = useMemo(() => {
    return [...leituras].sort((a, b) => Number(a.diaLeitura) - Number(b.diaLeitura));
  }, [leituras]);

  // 1. Análise de Dados: Mapeia apenas os índices dos itens com status "Atrasado"
  const indicesAtrasados = useMemo(() => {
    const indices = [];
    leiturasOrdenadas.forEach((item, index) => {
      if (!item.completo && Number(item.diaLeitura) < diaAtual) {
        indices.push(index);
      }
    });
    return indices;
  }, [leiturasOrdenadas, diaAtual]);

  // 4. Lógica de Scroll e Destaque
  const handleFocarAtrasado = () => {
    if (!indicesAtrasados || indicesAtrasados.length === 0) {
      return;
    }

    const idx = indiceAtualDoFoco % indicesAtrasados.length;
    const targetIndex = indicesAtrasados[idx];
    const targetItem = leiturasOrdenadas[targetIndex];

    if (targetItem && itemRefs.current[targetItem.id]) {
      const element = itemRefs.current[targetItem.id];
      const offsetTop = 180;
      const yPos = element.getBoundingClientRect().top + window.scrollY - offsetTop;

      window.scrollTo({
        top: Math.max(0, yPos),
        behavior: 'smooth',
      });

      setItemFocadoId(targetItem.id);
      setTimeout(() => {
        setItemFocadoId(null);
      }, 2000);
    }

    setIndiceAtualDoFoco((prev) => (prev + 1) % indicesAtrasados.length);
  };

  useEffect(() => {
    if (focarAtrasadoAuto) {
      handleFocarAtrasado();
      if (onResetFocarAtrasadoAuto) {
        onResetFocarAtrasadoAuto();
      }
    }
  }, [focarAtrasadoAuto]);

  return (
    <section className="list-card">
      <div className="list-header">
        <div>
          <h2>Leituras do mês</h2>
          <p>Gerencie os condomínios cadastrados.</p>
        </div>
      </div>

      <AlertaBanner
        leiturasHoje={leiturasHoje}
        leiturasAtrasadas={leiturasAtrasadas}
        onFocarAtrasado={handleFocarAtrasado}
      />

      {leituras.length === 0 ? (
        <div className="empty-state">
          Nenhuma leitura adicionada ainda. Comece a adicionar seus condomínios!
        </div>
      ) : (
        <div className="list-items">
          {leiturasOrdenadas.map((item) => (
            <div key={item.id} ref={(el) => (itemRefs.current[item.id] = el)}>
              <LeituraItem
                leitura={item}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
                isFocused={itemFocadoId === item.id}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default LeituraList;
