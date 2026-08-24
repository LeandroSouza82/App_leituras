import { useState } from 'react';
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

  return (
    <div className="condominio-detalhe-overlay" onClick={onClose}>
      <div className="condominio-detalhe-container" onClick={(event) => event.stopPropagation()}>
        
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
            <h3><Image size={16} /> Compressão de Imagem</h3>
            <p className={compressao ? '' : 'detalhe-vazio'} style={{ marginBottom: '16px', fontSize: '0.9rem' }}>
              A compressão máxima é recomendada para otimizar espaço no banco de dados e acelerar envios.
            </p>
            
            <div className="camera-botoes-container">
              <button 
                type="button" 
                className={`btn-3d ${compressao === 'maxima' ? 'btn-3d-primary' : 'btn-3d-outline'}`}
                onClick={() => handleMudarCompressao('maxima')}
              >
                Máxima (Ideal)
              </button>
              <button 
                type="button" 
                className={`btn-3d ${compressao === 'media' ? 'btn-3d-primary' : 'btn-3d-outline'}`}
                onClick={() => handleMudarCompressao('media')}
              >
                Média
              </button>
              <button 
                type="button" 
                className={`btn-3d ${compressao === 'baixa' ? 'btn-3d-primary' : 'btn-3d-outline'}`}
                onClick={() => handleMudarCompressao('baixa')}
              >
                Baixa
              </button>
            </div>
          </section>

          {/* SEÇÃO 2: SALVAR NA GALERIA */}
          <section className="detalhe-secao">
            <h3><Save size={16} /> Salvar no Aparelho</h3>
            <p className="detalhe-vazio" style={{ marginBottom: '16px', fontSize: '0.9rem' }}>
              Mantém uma cópia de segurança das fotos na galeria do seu dispositivo.
            </p>
            <div className="detalhe-status-linha">
              <span className="dia-leitura-badge">Cópia Local (Galeria)</span>
              
              <button 
                type="button"
                className={`btn-3d ${salvarGaleria ? 'btn-3d-toggle-on' : 'btn-3d-toggle-off'}`}
                onClick={handleToggleGaleria}
              >
                {salvarGaleria ? 'Habilitado' : 'Desabilitado'}
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

export default CameraSettingsModal;
