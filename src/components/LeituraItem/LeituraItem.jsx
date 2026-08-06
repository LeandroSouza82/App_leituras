import { Check, Trash2 } from 'lucide-react';
import './LeituraItem.css';

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

const LeituraItem = ({ leitura, onToggle, onDelete }) => {
  const diaAtual = new Date().getDate();
  const diaLeitura = Number(leitura.diaLeitura);

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

  return (
    <article className={`item-card ${leitura.completo ? 'completed' : ''}`}>
      <label className="item-main">
        <span className={`checkbox ${leitura.completo ? 'checked' : ''}`}>
          {leitura.completo ? <Check size={14} /> : null}
        </span>
        <input type="checkbox" checked={Boolean(leitura.completo)} onChange={() => onToggle(leitura.id)} />
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
        <button type="button" className="delete-btn" onClick={() => onDelete(leitura.id)}>
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
};

export default LeituraItem;
