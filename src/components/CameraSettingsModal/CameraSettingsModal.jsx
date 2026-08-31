import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, Image, Save } from 'lucide-react';
import '../CondominioDetalheModal/CondominioDetalheModal.css';
import './CameraSettingsModal.css';

const CameraSettingsModal = ({ isOpen, onClose }) => {
  // 1. Inicializa os estados lendo a memória do celular (localStorage)
  const [compressao, setCompressao] = useState(() => {
    return localStorage.getItem('config_compressao') || 'maxima';
  });
  
  const [salvarGaleria, setSalvarGaleria] = useState(() => {
    return localStorage.getItem('config_copia_galeria') === 'true';
  });

  if (!isOpen) return null;

  // 2. Funções cirúrgicas para atualizar a tela e salvar na memória ao mesmo tempo
  const handleMudarCompressao = (nivel) => {
    setCompressao(nivel);
    localStorage.setItem('config_compressao', nivel);
  };

  const handleToggleGaleria = () => {
    const novoEstado = !salvarGaleria;
    setSalvarGaleria(novoEstado);
    localStorage.setItem('config_copia_galeria', String(novoEstado));
  };

  return createPortal(
    <div className="condominio-detalhe-overlay" style={{ zIndex: 99999 }} onClick={onClose}>
      <div className="condominio-detalhe-container" style={{ margin: 'auto' }} onClick={(event) => event.stopPropagation()}>
        
        {/* CABEÇALHO */}
        <div className="condominio-detalhe-header">
          <div className="condominio-detalhe-title">
            <Camera size={20} />
            <h2>Configurações da Câmera</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="condominio-detalhe-body">
          
          {/* SEÇÃO 1: COMPRESSÃO */}
          <section className="detalhe-secao">
            <h3 className="section-title">COMPRESSÃO DE IMAGEM</h3>
            <p className="section-description">
              A compressão máxima é recomendada para otimizar espaço no banco de dados e acelerar envios.
            </p>
            
            <div className="segmented-control">
              <button 
                type="button" 
                className={`segment-btn ${compressao === 'maxima' ? 'segment-active' : ''}`}
                onClick={() => handleMudarCompressao('maxima')}
              >
                Máxima
              </button>
              <button 
                type="button" 
                className={`segment-btn ${compressao === 'media' ? 'segment-active' : ''}`}
                onClick={() => handleMudarCompressao('media')}
              >
                Média
              </button>
              <button 
                type="button" 
                className={`segment-btn ${compressao === 'baixa' ? 'segment-active' : ''}`}
                onClick={() => handleMudarCompressao('baixa')}
              >
                Baixa
              </button>
            </div>
          </section>

          {/* SEÇÃO 2: SALVAR NA GALERIA */}
          <section className="detalhe-secao" style={{ marginTop: '16px' }}>
            <h3 className="section-title">ARMAZENAMENTO</h3>
            <p className="section-description">
              Ative abaixo se quiser manter também uma cópia extra no seu aparelho.
            </p>
            
            <div className="toggle-card">
              <div className="toggle-info">
                <span className="toggle-title">Cópia local (galeria)</span>
                <span className="toggle-subtitle">{salvarGaleria ? 'Ativado' : 'Desabilitado'}</span>
              </div>
              <button 
                type="button"
                className={`toggle-switch ${salvarGaleria ? 'toggle-on' : 'toggle-off'}`}
                onClick={handleToggleGaleria}
                aria-pressed={salvarGaleria}
                aria-label="Alternar cópia local"
              >
                <div className="toggle-knob" />
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>,
    document.body
  );
};

export default CameraSettingsModal;
