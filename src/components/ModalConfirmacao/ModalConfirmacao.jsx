import { createPortal } from 'react-dom';
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

  return createPortal(
    <div className="modal-confirmacao-overlay" style={{ position: 'fixed', inset: 0, zIndex: 2147483647, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    </div>,
    document.body
  );
};

export default ModalConfirmacao;
