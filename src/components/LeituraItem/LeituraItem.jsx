import { useState } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import './LeituraItem.css';
import ModalConfirmacao from '../ModalConfirmacao/ModalConfirmacao';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editDia, setEditDia] = useState(leitura.diaLeitura);
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
          <p>{formatDateBR(leitura.data)}</p>
          <span>{leitura.apartamentos} apartamentos</span>
        </div>
      </label>

      <div className="item-actions">
        <div className="item-value">{formatCurrency(leitura.valor)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" className="btn-editar" onClick={() => setIsEditing(!isEditing)} title="Editar dia">
              <Pencil color="#2563eb" size={18} />
            </button>
            <button type="button" className="delete-btn" onClick={() => setMostrarModalDeletar(true)}>
              <Trash2 size={16} />
            </button>
          </div>
          {isEditing && (
            <div className="painel-edicao" style={{ display: 'flex', gap: '8px', marginTop: '2px', alignItems: 'center' }}>
              <label style={{ fontSize: '0.8rem' }}>Novo Dia:</label>
              <input
                type="number"
                min="1"
                max="31"
                value={editDia}
                onChange={(e) => setEditDia(e.target.value)}
                style={{ width: '60px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
              <button
                type="button"
                onClick={() => {
                  onEdit(leitura.id, { diaLeitura: Number(editDia) });
                  setIsEditing(false);
                }}
                style={{ padding: '4px 8px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px' }}
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{ padding: '4px 8px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '4px' }}
              >
                Sair
              </button>
            </div>
          )}
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
    </>
  );
};

export default LeituraItem;
