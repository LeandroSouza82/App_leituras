import './ModalAviso.css';

const ModalAviso = ({ isOpen, onClose, leiturasHoje = [], leiturasAtrasadas = [] }) => {
  if (!isOpen) {
    return null;
  }

  const totalHoje = leiturasHoje.length;
  const totalAtrasadas = leiturasAtrasadas.length;
  const totalPendentes = totalHoje + totalAtrasadas;

  const mensagem =
    totalPendentes === 0
      ? 'Nenhuma leitura pendente no momento.'
      : `${totalHoje} leitura(s) para HOJE e ${totalAtrasadas} ATRASADA(S)!`;

  return (
    <div className="modal-aviso-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-aviso-card" onClick={(event) => event.stopPropagation()}>
        <h3>🔔 Resumo de Leituras Pendentes</h3>
        <p>{mensagem}</p>
        <button type="button" className="modal-aviso-button" onClick={onClose}>
          Entendido
        </button>
      </div>
    </div>
  );
};

export default ModalAviso;
