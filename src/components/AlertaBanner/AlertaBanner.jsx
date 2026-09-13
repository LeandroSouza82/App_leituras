import { useState } from 'react';
import './AlertaBanner.css';

const AlertaBanner = ({
  leiturasHoje = [],
  leiturasAmanha = [],
  leiturasAtrasadas = [],
  onFocarAtrasado,
  className = '',
}) => {
  const [isRecolhido, setIsRecolhido] = useState(false);

  const temHoje = leiturasHoje.length > 0;
  const temAmanha = leiturasAmanha.length > 0;
  const temAtrasadas = leiturasAtrasadas.length > 0;
  const totalAlertas = leiturasHoje.length + leiturasAmanha.length + leiturasAtrasadas.length;

  if (!temHoje && !temAmanha && !temAtrasadas) {
    return null;
  }

  if (isRecolhido) {
    return (
      <div className={`alerta-banner alerta-banner--recolhido ${className}`.trim()} aria-live="polite">
        <button
          type="button"
          className={`alerta-banner__recolhido-btn ${temAtrasadas || temHoje ? 'alerta-banner__recolhido-btn--vermelho' : 'alerta-banner__recolhido-btn--amarelo'}`}
          onClick={() => setIsRecolhido(false)}
          title="Mostrar alertas de leitura"
          aria-label={`Mostrar ${totalAlertas} ${totalAlertas === 1 ? 'alerta de leitura' : 'alertas de leitura'}`}
        >
          <span className="alerta-banner__recolhido-icone" aria-hidden="true">🔔</span>
          <span className="alerta-banner__recolhido-contagem">{totalAlertas}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`alerta-banner ${className}`.trim()} aria-live="polite">
      {temHoje && (
        <button
          type="button"
          className="alerta-banner__item alerta-banner__item--hoje"
          onClick={() => onFocarAtrasado?.('hoje')}
          disabled={!onFocarAtrasado}
          title="Clique para focar nas leituras de hoje"
          aria-label={`${leiturasHoje.length} ${leiturasHoje.length === 1 ? 'leitura para hoje' : 'leituras para hoje'}`}
        >
          <span className="alerta-banner__label">
            {`🚨 ${leiturasHoje.length} hoje`}
          </span>
        </button>
      )}

      {temAmanha && (
        <button
          type="button"
          className="alerta-banner__item alerta-banner__item--amanha"
          onClick={() => onFocarAtrasado?.('amanha')}
          disabled={!onFocarAtrasado}
          title="Clique para focar nas leituras que vencem amanhã"
          aria-label={`${leiturasAmanha.length} ${leiturasAmanha.length === 1 ? 'leitura para amanhã' : 'leituras para amanhã'}`}
        >
          <span className="alerta-banner__label">
            {`⏰ ${leiturasAmanha.length} amanhã`}
          </span>
        </button>
      )}

      {temAtrasadas && (
        <button
          type="button"
          className="alerta-banner__item alerta-banner__item--atrasadas"
          onClick={() => onFocarAtrasado?.('atrasadas')}
          disabled={!onFocarAtrasado}
          title="Clique para focar nas leituras atrasadas"
          aria-label={`${leiturasAtrasadas.length} ${leiturasAtrasadas.length === 1 ? 'leitura atrasada' : 'leituras atrasadas'}`}
        >
          <span className="alerta-banner__label">
            {`🚨 ${leiturasAtrasadas.length} ${leiturasAtrasadas.length === 1 ? 'atrasada' : 'atrasadas'}`}
          </span>
        </button>
      )}

      <button
        type="button"
        className="alerta-banner__close"
        onClick={() => setIsRecolhido(true)}
        aria-label="Ocultar alertas temporariamente"
        title="Ocultar alertas temporariamente"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
};

export default AlertaBanner;
