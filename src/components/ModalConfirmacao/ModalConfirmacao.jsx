import './ModalConfirmacao.css';

const ModalConfirmacao = ({ isOpen, titulo, mensagem, onConfirm, onCancel }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{titulo}</h3>
        <p>{mensagem}</p>
        <div className="modal-acoes">
          <button type="button" className="btn-cancelar" onClick={onCancel}>
            Não, cancelar
          </button>
          <button type="button" className="btn-confirmar" onClick={onConfirm}>
            Sim, confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalConfirmacao;
