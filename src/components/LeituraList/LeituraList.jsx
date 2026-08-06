import './LeituraList.css';
import LeituraItem from '../LeituraItem/LeituraItem';

const LeituraList = ({ leituras, onToggle, onDelete }) => {
  return (
    <section className="list-card">
      <div className="list-header">
        <div>
          <h2>Leituras do mês</h2>
          <p>Gerencie os condomínios cadastrados.</p>
        </div>
      </div>

      {leituras.length === 0 ? (
        <div className="empty-state">
          Nenhuma leitura adicionada ainda. Comece a adicionar seus condomínios!
        </div>
      ) : (
        <div className="list-items">
          {[...leituras]
            .sort((a, b) => Number(a.diaLeitura) - Number(b.diaLeitura))
            .map((item) => (
              <LeituraItem key={item.id} leitura={item} onToggle={onToggle} onDelete={onDelete} />
            ))}
        </div>
      )}
    </section>
  );
};

export default LeituraList;
