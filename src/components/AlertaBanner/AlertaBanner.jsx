const AlertaBanner = ({
  leiturasHoje = [],
  leiturasAtrasadas = [],
  onFocarAtrasado,
  onFocarHoje,
}) => {
  const temHoje = leiturasHoje.length > 0;
  const temAtrasadas = leiturasAtrasadas.length > 0;

  if (!temHoje && !temAtrasadas) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginBottom: '12px',
      }}
    >
      {temHoje && (
        <div
          onClick={onFocarHoje}
          style={{
            background: '#fef3c7',
            color: '#92400e',
            border: '1px solid #fde68a',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: onFocarHoje ? 'pointer' : 'default',
            userSelect: 'none',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          title="Clique para focar na leitura de hoje"
        >
          ⚠️ <strong>Atenção:</strong> Você tem {leiturasHoje.length} leitura(s) agendada(s) para HOJE!
        </div>
      )}

      {temAtrasadas && (
        <div
          onClick={onFocarAtrasado}
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: onFocarAtrasado ? 'pointer' : 'default',
            userSelect: 'none',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          title="Clique para focar na leitura atrasada"
        >
          🚨 <strong>Pendente:</strong> Você tem {leiturasAtrasadas.length} leitura(s) ATRASADA(S)!
        </div>
      )}
    </div>
  );
};

export default AlertaBanner;
