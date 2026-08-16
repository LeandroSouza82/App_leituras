import { useEffect, useMemo, useRef, useState } from 'react';
import './LeituraList.css';
import LeituraItem from '../LeituraItem/LeituraItem';
import AlertaBanner from '../AlertaBanner/AlertaBanner';

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
  leiturasAtrasadas,
  onToggle,
  onDelete,
  onEdit,
  focarAtrasadoAuto,
  onResetFocarAtrasadoAuto,
}) => {
  const diaAtual = new Date().getDate();
  const [indiceAtrasado, setIndiceAtrasado] = useState(0);
  const [indiceHoje, setIndiceHoje] = useState(0);
  const [itemFocadoId, setItemFocadoId] = useState(null);
  const [filtroCondominio, setFiltroCondominio] = useState('');
  const itemRefs = useRef({});
  const focoTimeoutRef = useRef(null);

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
        item.condominio?.nome,
      ];

      return valoresParaVerificar.some((valor) =>
        normalizarTexto(valor).includes(termoBusca)
      );
    });
  }, [leiturasOrdenadas, filtroCondominio]);

  // 3. Índices dos cards "Atrasado" na lista filtrada
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

  // 4. Índices dos cards "Fazer Hoje/Breve" na lista filtrada
  const indicesHoje = useMemo(() => {
    const indices = [];
    leiturasFiltradas.forEach((item, index) => {
      if (item.completo) return;

      const dia = extrairNumeroDia(item.diaLeitura);
      // Mesma regra do status em LeituraItem: hoje ou até 2 dias à frente
      const isFazerHoje =
        dia !== null && (dia === diaAtual || (dia > diaAtual && dia - diaAtual <= 2));

      if (isFazerHoje) {
        indices.push(index);
      }
    });
    return indices;
  }, [leiturasFiltradas, diaAtual]);

  // 5. Scroll + destaque cíclico (compartilhado entre hoje e atrasadas)
  const handleFocarNoItem = (listaIndices, setterIndice, indiceAtual) => {
    if (!listaIndices || listaIndices.length === 0) return;

    const safeIndex = indiceAtual % listaIndices.length;
    const targetIndexInFiltered = listaIndices[safeIndex];
    const targetItem = leiturasFiltradas[targetIndexInFiltered];

    if (targetItem && itemRefs.current[targetItem.id]) {
      const element = itemRefs.current[targetItem.id];
      const offsetTop = 180;
      const yPos = element.getBoundingClientRect().top + window.scrollY - offsetTop;

      window.scrollTo({
        top: Math.max(0, yPos),
        behavior: 'smooth',
      });

      setItemFocadoId(targetItem.id);

      if (focoTimeoutRef.current) {
        clearTimeout(focoTimeoutRef.current);
      }
      focoTimeoutRef.current = setTimeout(() => {
        setItemFocadoId(null);
        focoTimeoutRef.current = null;
      }, 2000);
    }

    setterIndice((indiceAtual + 1) % listaIndices.length);
  };

  const handleFocarAtrasado = () =>
    handleFocarNoItem(indicesAtrasados, setIndiceAtrasado, indiceAtrasado);

  const handleFocarHoje = () =>
    handleFocarNoItem(indicesHoje, setIndiceHoje, indiceHoje);

  useEffect(() => {
    if (focarAtrasadoAuto) {
      handleFocarAtrasado();
      if (onResetFocarAtrasadoAuto) {
        onResetFocarAtrasadoAuto();
      }
    }
  }, [focarAtrasadoAuto]);

  useEffect(() => {
    return () => {
      if (focoTimeoutRef.current) {
        clearTimeout(focoTimeoutRef.current);
      }
    };
  }, []);

  return (
    <section className="list-card">
      <div className="list-sticky-top">
        <div className="list-header">
          <div>
            <h2>Leituras do mês</h2>
            <p>Gerencie os condomínios cadastrados.</p>
          </div>
        </div>

        <div className="busca-container">
          <input
            type="text"
            placeholder="🔍 Buscar condomínio..."
            value={filtroCondominio}
            onChange={(e) => setFiltroCondominio(e.target.value)}
            className="busca-input"
          />
        </div>

        <AlertaBanner
          leiturasHoje={leiturasHoje}
          leiturasAtrasadas={leiturasAtrasadas}
          onFocarAtrasado={handleFocarAtrasado}
          onFocarHoje={handleFocarHoje}
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
