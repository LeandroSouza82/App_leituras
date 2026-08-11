import { useState } from 'react';
import { Check, Gauge, KeyRound, Navigation, Pencil, Phone, Trash2 } from 'lucide-react';
import './LeituraItem.css';
import ModalConfirmacao from '../ModalConfirmacao/ModalConfirmacao';
import EditarCondominioModal from '../EditarCondominioModal/EditarCondominioModal';

const formatCurrency = (value) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const formatDateBR = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString('pt-BR');
};

const LeituraItem = ({ leitura, onToggle, onDelete, onEdit, isFocused }) => {
  const diaAtual = new Date().getDate();
  const diaLeitura = Number(leitura.diaLeitura);
  const [mostrarModalEdicao, setMostrarModalEdicao] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarModalDeletar, setMostrarModalDeletar] = useState(false);

  const { statusLabel, statusClass, statusEmoji } = leitura.completo
    ? { statusLabel: 'Concluído', statusClass: 'status-success', statusEmoji: '🟢' }
    : diaAtual > diaLeitura
    ? { statusLabel: 'Atrasado', statusClass: 'status-danger', statusEmoji: '🔴' }
    : diaLeitura - diaAtual <= 2
    ? { statusLabel: 'Fazer Hoje/Breve', statusClass: 'status-warning', statusEmoji: '🟡' }
    : { statusLabel: `Aguardando (Dia ${diaLeitura})`, statusClass: 'status-pending', statusEmoji: '⚪' };

  const badgeText = `Dia ${diaLeitura}`;
  const badgeDayClass = leitura.completo
    ? 'badge-dia-success'
    : diaLeitura < diaAtual
    ? 'badge-dia-danger'
    : 'badge-dia-awaiting';

  const tituloModal = leitura.completo ? 'Desmarcar Leitura?' : 'Concluir Leitura?';
  const mensagemModal = leitura.completo
    ? `Tem certeza que deseja desmarcar a leitura do condomínio "${leitura.nome}"?`
    : `Deseja marcar a leitura do condomínio "${leitura.nome}" como concluída neste mês?`;

  const handleCheckboxClick = (event) => {
    event.preventDefault();
    setMostrarModal(true);
  };

  const handleConfirmar = () => {
    onToggle(leitura.id);
    setMostrarModal(false);
  };

  const handleCancelar = () => {
    setMostrarModal(false);
  };

  const handleOpenMaps = (e) => {
    e.stopPropagation();
    const query = encodeURIComponent(leitura.endereco || leitura.nome);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  return (
    <>
    <article className={`item-card ${leitura.completo ? 'completed' : ''} ${isFocused ? 'focado-atrasado' : ''}`}>
      <label className="item-main">
        <span className={`checkbox ${leitura.completo ? 'checked' : ''}`}>
          {leitura.completo ? <Check size={14} /> : null}
        </span>
        <input type="checkbox" checked={Boolean(leitura.completo)} onChange={handleCheckboxClick} />
        <div className="item-info">
          <div className="card-header">
            <h3 className="card-title">{leitura.nome}</h3>
            <span className={`badge-dia ${badgeDayClass}`}>{badgeText}</span>
          </div>
          <div className="item-info-top">
            <span className={`status-badge ${statusClass}`}>
              {statusEmoji} {statusLabel}
            </span>
          </div>

          <div className="tipo-leitura-tag">
            <Gauge size={14} />
            <span>{leitura.tipoLeitura || 'Água e Gás'}</span>
          </div>

          <p className="item-data">{formatDateBR(leitura.data)} • {leitura.apartamentos} aptos</p>

          {leitura.instrucoesAcesso && (
            <div className="info-extra">
              <KeyRound size={13} />
              <span>{leitura.instrucoesAcesso}</span>
            </div>
          )}

          {leitura.contatoSindico && (
            <div className="info-extra">
              <Phone size={13} />
              <a href={`tel:${leitura.contatoSindico}`} onClick={(e) => e.stopPropagation()}>
                {leitura.contatoSindico}
              </a>
            </div>
          )}
        </div>
      </label>

      <div className="item-actions">
        <div className="item-value">{formatCurrency(leitura.valor)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="btn-maps"
            onClick={handleOpenMaps}
            title="Abrir no Google Maps"
          >
            <Navigation size={16} />
          </button>
          <button type="button" className="btn-editar" onClick={() => setMostrarModalEdicao(true)} title="Editar condomínio">
            <Pencil color="#1e88e5" size={16} />
          </button>
          <button type="button" className="delete-btn" onClick={() => setMostrarModalDeletar(true)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
    <ModalConfirmacao
      isOpen={mostrarModal}
      titulo={tituloModal}
      mensagem={mensagemModal}
      onConfirm={handleConfirmar}
      onCancel={handleCancelar}
    />
    <ModalConfirmacao
      isOpen={mostrarModalDeletar}
      titulo="Excluir Condomínio"
      mensagem="Tem certeza que deseja excluir este condomínio?"
      textoCancelar="Cancelar"
      textoConfirmar="Excluir"
      btnConfirmarClasse="btn-excluir"
      onConfirm={() => {
        onDelete(leitura.id);
        setMostrarModalDeletar(false);
      }}
      onCancel={() => setMostrarModalDeletar(false)}
    />
    <EditarCondominioModal
      isOpen={mostrarModalEdicao}
      onClose={() => setMostrarModalEdicao(false)}
      condominio={leitura}
      onSave={(id, dadosAtualizados) => onEdit(id, dadosAtualizados)}
    />
    </>
  );
};

export default LeituraItem;
