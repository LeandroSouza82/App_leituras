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
    <div className="modal-confirmacao-overlay" style={{ position: 'fixed', inset: 0, zIndex: 999999, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
      <div className="modal-content" style={{ position: 'relative', zIndex: 999999 }} onClick={(e) => e.stopPropagation()}>
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
