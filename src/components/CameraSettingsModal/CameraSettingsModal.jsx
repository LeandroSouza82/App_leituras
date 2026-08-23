import { useState } from 'react';
import { Camera, X, Image, Save } from 'lucide-react';
import '../CondominioDetalheModal/CondominioDetalheModal.css';
import './CameraSettingsModal.css';

const CameraSettingsModal = ({ isOpen, onClose }) => {
  const [compressao, setCompressao] = useState('maxima');
  const [salvarGaleria, setSalvarGaleria] = useState(false);

  if (!isOpen) return null;

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
                onClick={() => setCompressao('maxima')}
              >
                Máxima (Ideal)
              </button>
              <button 
                type="button" 
                className={`btn-3d ${compressao === 'media' ? 'btn-3d-primary' : 'btn-3d-outline'}`}
                onClick={() => setCompressao('media')}
              >
                Média
              </button>
              <button 
                type="button" 
                className={`btn-3d ${compressao === 'baixa' ? 'btn-3d-primary' : 'btn-3d-outline'}`}
                onClick={() => setCompressao('baixa')}
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
                onClick={() => setSalvarGaleria(!salvarGaleria)}
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
