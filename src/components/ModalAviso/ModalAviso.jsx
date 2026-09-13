import './ModalAviso.css';

const ModalAviso = ({
  isOpen,
  onClose,
  leiturasHoje = [],
  leiturasAmanha = [],
  leiturasAtrasadas = [],
  onNavigateToLeituras,
}) => {
  if (!isOpen) {
    return null;
  }

  const totalHoje = leiturasHoje.length;
  const totalAmanha = leiturasAmanha.length;
  const totalAtrasadas = leiturasAtrasadas.length;
  const totalPendentes = totalHoje + totalAmanha + totalAtrasadas;

  const mensagem =
    totalPendentes === 0
      ? 'Nenhuma leitura pendente no momento.'
      : `${totalAtrasadas} atrasada(s), ${totalHoje} para HOJE e ${totalAmanha} a vencer amanhã.`;

  const handleEntendido = () => {
    onClose();
    if (onNavigateToLeituras && totalPendentes > 0) {
      const focoTipo = totalAtrasadas > 0
        ? 'atrasadas'
        : totalHoje > 0
        ? 'hoje'
        : 'amanha';
      onNavigateToLeituras(focoTipo);
    }
  };

  return (
    <div className="modal-aviso-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-aviso-card" onClick={(event) => event.stopPropagation()}>
        <h3>🔔 Resumo de Leituras Pendentes</h3>
        <p>{mensagem}</p>
        <button type="button" className="modal-aviso-button" onClick={handleEntendido}>
          Ver Leituras
        </button>
      </div>
    </div>
  );
};

export default ModalAviso;
