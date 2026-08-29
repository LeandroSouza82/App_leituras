const fs = require('fs');
let code = fs.readFileSync('src/components/CustomPrompt/CustomPrompt.jsx', 'utf8');
const alertModal = \
const AlertModal = ({ title, message, onResolve }) => {
  return (
    <div className="custom-prompt-overlay" onClick={() => onResolve(true)}>
      <div 
        className="custom-prompt-container" 
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="custom-prompt-title">{title || 'Aviso'}</h2>
        <p className="custom-prompt-message">{message}</p>
        
        <div className="custom-prompt-actions" style={{ justifyContent: 'center' }}>
          <button 
            type="button" 
            className="custom-prompt-btn-confirmar"
            onClick={() => onResolve(true)}
            style={{ width: '100%' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export const customAlert = (message, title = 'Aviso') => {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleResolve = (result) => {
      root.unmount();
      container.remove();
      resolve(result);
    };

    root.render(
      <AlertModal 
        title={title} 
        message={message} 
        onResolve={handleResolve} 
      />
    );
  });
};
\;
code = code + '\n' + alertModal;
fs.writeFileSync('src/components/CustomPrompt/CustomPrompt.jsx', code, 'utf8');
