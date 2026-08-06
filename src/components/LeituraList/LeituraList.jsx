import { useState } from 'react';
import './LeituraList.css';
import LeituraItem from '../LeituraItem/LeituraItem';
import AlertaBanner from '../AlertaBanner/AlertaBanner';

const LeituraList = ({ leituras, leiturasHoje, leiturasAtrasadas, onToggle, onDelete, onEdit }) => {
  const [busca, setBusca] = useState('');

  const leiturasFiltradas = leituras.filter((item) =>
    item.nome?.toLowerCase().includes(busca.toLowerCase().trim())
  );

  return (
    <section className="list-card">
      <div className="list-header">
        <div>
          <h2>Leituras do mês</h2>
          <p>Gerencie os condomínios cadastrados.</p>
        </div>
      </div>

      <AlertaBanner leiturasHoje={leiturasHoje} leiturasAtrasadas={leiturasAtrasadas} />

      <div className="search-box">
        <input
          type="text"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar condomínio..."
          className="search-input"
        />
      </div>

      {leituras.length === 0 ? (
        <div className="empty-state">
          Nenhuma leitura adicionada ainda. Comece a adicionar seus condomínios!
        </div>
      ) : (
        <div className="list-items">
          {[...leiturasFiltradas]
            .sort((a, b) => Number(a.diaLeitura) - Number(b.diaLeitura))
            .map((item) => (
              <LeituraItem key={item.id} leitura={item} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
            ))}
        </div>
      )}
    </section>
  );
};

export default LeituraList;
