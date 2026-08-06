import { useState } from 'react';
import './ProgressoModal.css';

const ProgressoModal = ({ isOpen, onClose, leituras = [] }) => {
  const [busca, setBusca] = useState('');

  if (!isOpen) {
    return null;
  }

  const pendentes = (leituras || []).filter((item) => !item.completo);
  const proximoDia =
    pendentes.length > 0
      ? Math.min(...pendentes.map((item) => Number(item.diaLeitura) || 99))
      : null;

  const leiturasOrdenadas = [...(leituras || [])].sort((a, b) => {
    // 1. Concluídos primeiro (true antes de false)
    if (a.completo !== b.completo) {
      return a.completo ? -1 : 1;
    }
    // 2. Ordenação secundária pelo dia da leitura (crescente)
    return Number(a.diaLeitura) - Number(b.diaLeitura);
  });

  const listaFiltrada = leiturasOrdenadas.filter((item) =>
    item.nome.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-lista-container" onClick={(event) => event.stopPropagation()}>
        <div className="progresso-modal-header">
          <div>
            <h2>📊 Progresso das Leituras</h2>
            <span className="subtitulo-contador">
              {leituras.filter((item) => item.completo).length} de {leituras.length} concluído(s)
            </span>
          </div>

          <div className="modal-header-actions">
            {/* Canto superior direito DENTRO/SOBRE o Modal */}
            <div className="modal-badge-dia">
              {proximoDia ? `Dia ${proximoDia}` : 'Concluído'}
            </div>
            <button type="button" className="btn-fechar" onClick={onClose} aria-label="Fechar modal">
              ✕
            </button>
          </div>
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
                  <div className="item-condominio-info">
                    <span className="numero-item">{index + 1}</span>
                    <span className="nome-condominio">{item.nome}</span>
                  </div>
                  <span
                    className={`badge-status-modal ${
                      item.completo ? 'badge-status-concluido' : 'badge-status-pendente'
                    }`}
                  >
                    {item.completo ? 'Concluído' : `Dia ${item.diaLeitura}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressoModal;
