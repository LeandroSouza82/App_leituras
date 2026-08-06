import './ModalConfirmacao.css';

const ModalConfirmacao = ({
  isOpen,
  titulo,
  mensagem,
  onConfirm,
  onCancel,
  textoCancelar = 'Não, cancelar',
  textoConfirmar = 'Sim, confirmar',
  btnConfirmarClasse = 'btn-confirmar',
}) => {
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
            {textoCancelar}
          </button>
          <button type="button" className={btnConfirmarClasse} onClick={onConfirm}>
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalConfirmacao;
