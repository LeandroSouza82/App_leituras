import { useState } from 'react';
import './ListaCondominiosModal.css';

const ListaCondominiosModal = ({ isOpen, onClose, leituras = [] }) => {
  const [busca, setBusca] = useState('');

  if (!isOpen) {
    return null;
  }

  const listaFiltrada = leituras.filter((item) =>
    item.nome.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-lista-container" onClick={(event) => event.stopPropagation()}>
        <div className="modal-lista-header">
          <div>
            <h2>🏢 Condomínios Cadastrados</h2>
            <span className="subtitulo-contador">{leituras.length} condomínio(s) no total</span>
          </div>
          <button type="button" className="btn-fechar" onClick={onClose}>
            ✕
          </button>
        </div>

        {leituras.length > 5 && (
          <input
            type="text"
            placeholder="🔍 Buscar condomínio pelo nome..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            className="input-busca-condominio"
          />
        )}

        <div className="modal-lista-body">
          {listaFiltrada.length === 0 ? (
            <p className="lista-vazia">Nenhum condomínio encontrado.</p>
          ) : (
            <ul className="lista-condominios-ul">
              {listaFiltrada.map((item, index) => (
                <li key={item.id || index} className="item-condominio">
                  <span className="numero-item">{index + 1}</span>
                  <span className="nome-condominio">{item.nome}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ListaCondominiosModal;
