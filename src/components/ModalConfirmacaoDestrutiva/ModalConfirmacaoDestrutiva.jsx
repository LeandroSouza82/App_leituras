import { createPortal } from 'react-dom';
import './ModalConfirmacaoDestrutiva.css';

const ModalConfirmacaoDestrutiva = ({
  isOpen,
  titulo,
  mensagem = 'Essa ação não pode ser desfeita.',
  onConfirm,
  onCancel,
  textoCancelar = 'Cancelar',
  textoConfirmar = 'Excluir',
}) => {
  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="modal-destrutiva-overlay" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
      <div className="modal-destrutiva-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-destrutiva-titulo">{titulo}</h3>
        <p className="modal-destrutiva-mensagem">{mensagem}</p>
        <div className="modal-destrutiva-acoes">
          <button type="button" className="btn-destrutiva-cancelar" onClick={onCancel}>
            {textoCancelar}
          </button>
          <button type="button" className="btn-destrutiva-confirmar" onClick={onConfirm}>
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModalConfirmacaoDestrutiva;
