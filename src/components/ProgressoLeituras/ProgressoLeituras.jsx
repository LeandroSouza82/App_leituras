import './ProgressoLeituras.css';

const limitarPercentual = (valor) => {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(numero)));
};

const normalizarQuantidade = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(0, numero) : 0;
};

const ProgressoLeituras = ({ percentual, concluidos, total, onClick }) => {
  const percentualExibido = limitarPercentual(percentual);
  const concluidosExibidos = normalizarQuantidade(concluidos);
  const totalExibido = normalizarQuantidade(total);
  const concluido = percentualExibido === 100;

  return (
    <button
      type="button"
      className={`progresso-leituras${concluido ? ' progresso-leituras--completo' : ''}`}
      onClick={onClick}
      aria-label={`Ver progresso das leituras: ${percentualExibido}% concluído`}
    >
      <span className="progresso-leituras-cabecalho">
        <span className="progresso-leituras-titulo">Progresso das leituras</span>
        <span className="progresso-leituras-percentual">
          {concluido && <span aria-hidden="true">✓</span>}
          {percentualExibido}%
        </span>
      </span>

      <span
        className="progresso-leituras-trilho"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={percentualExibido}
      >
        <span
          className="progresso-leituras-preenchimento"
          style={{ width: `${percentualExibido}%` }}
        >
          {percentualExibido > 0 && <span className="progresso-leituras-ponta" />}
        </span>
      </span>

      <span className="progresso-leituras-descricao">
        {concluidosExibidos} de {totalExibido} condomínios concluídos
      </span>
    </button>
  );
};

export default ProgressoLeituras;
