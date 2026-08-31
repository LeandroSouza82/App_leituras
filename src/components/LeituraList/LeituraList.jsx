import { useEffect, useMemo, useRef, useState } from 'react';
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

  // 4. Lógica de Scroll e Destaque
  const handleFocarAtrasado = () => {
    let indicesAlvo = indicesAtrasados;
    if (!indicesAlvo || indicesAlvo.length === 0) {
      indicesAlvo = leiturasFiltradas
        .map((item, index) => (!item.completo ? index : null))
        .filter((i) => i !== null);
    }

    if (!indicesAlvo || indicesAlvo.length === 0) {
      return;
    }

    const idx = indiceAtualDoFoco % indicesAlvo.length;
    const targetIndex = indicesAlvo[idx];
    const targetItem = leiturasFiltradas[targetIndex];

    if (targetItem && itemRefs.current[targetItem.id]) {
      const element = itemRefs.current[targetItem.id];
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      setItemFocadoId(targetItem.id);
      setTimeout(() => {
        setItemFocadoId(null);
      }, 2500);
    }

    setIndiceAtualDoFoco((prev) => (prev + 1) % indicesAlvo.length);
  };

  useEffect(() => {
    if (focarAtrasadoAuto) {
      const timer = setTimeout(() => {
        handleFocarAtrasado();
        if (onResetFocarAtrasadoAuto) {
          onResetFocarAtrasadoAuto();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [focarAtrasadoAuto, indicesAtrasados]);

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
