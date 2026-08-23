import React, { useState, useRef } from 'react';
import { MessageSquare, X, Image as ImageIcon, Send, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import '../AReceberModal/AReceberModal.css'; // Herdando o design system do modal padrão (cabeçalho azul escuro, bordas)
import './FeedbackModal.css';

// Função utilitária para comprimir a imagem via Canvas
const comprimirImagemBase64 = (base64Str, maxWidth = 800, quality = 0.5) => {
  return new Promise((resolve) => {
    if (!base64Str) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Retorna a imagem super compactada em JPEG
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedBase64);
    };
    img.onerror = () => resolve(base64Str); // Fallback caso dê erro na leitura
  });
};

const FeedbackModal = ({ isOpen, onClose }) => {
  const [descricao, setDescricao] = useState('');
  const [imageFile, setImageFile] = useState(null); // Armazena o Base64 original
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Handler do Input de Arquivo (lê como Base64 cru para exibir o preview e guardar para envio)
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setImageFile(base64String);
      setPreviewUrl(base64String);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEnviarFeedback = async (textoFeedback, imagemOriginalUri = null) => {
    try {
      if (!textoFeedback || !textoFeedback.trim()) {
        alert('Por favor, digite sua mensagem antes de enviar.');
        return false;
      }

      // 1. Comprime a imagem pesada antes de mandar para o banco
      let imagemComprimida = null;
      if (imagemOriginalUri) {
        imagemComprimida = await comprimirImagemBase64(imagemOriginalUri, 800, 0.4);
      }

      // 2. Envia para a tabela app_feedbacks mapeando exatamente com as colunas reais
      if (supabase) {
        const payload = {
          descricao: textoFeedback.trim(),
          imagem_url: imagemComprimida || ''
        };

        const { error } = await supabase.from('app_feedbacks').insert([payload]);

        if (error) {
          console.error("Detalhe técnico do erro Supabase:", error);
          throw new Error(error.message);
        }
      }

      alert('Feedback enviado com sucesso! Muito obrigado.');
      if (typeof onClose === 'function') onClose();
      return true;
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
      alert('Não foi possível enviar o feedback no momento. Verifique sua conexão e tente novamente.');
      return false;
    }
  };

  // Wrapper para conectar o botão ao método definitivo de envio
  const handleSubmit = async () => {
    setIsSubmitting(true);
    const sucesso = await handleEnviarFeedback(descricao, imageFile);
    if (sucesso) {
      setDescricao('');
      removeImage();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-lista-container" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        
        {/* CABEÇALHO PADRÃO ESCURO */}
        <div className="modal-lista-header">
          <div>
            <h2>
              <MessageSquare size={18} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 6 }}/> 
              Enviar Feedback
            </h2>
            <span className="subtitulo-contador">Reporte bugs ou dê sugestões</span>
          </div>
          <button type="button" className="btn-fechar" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="modal-lista-body" style={{ padding: '24px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ÁREA DE TEXTO (TEXTAREA) */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
                Descrição Detalhada
              </label>
              <textarea 
                className="feedback-textarea"
                placeholder="Ex: O botão de confirmar leitura travou quando tentei anexar a foto no AP-102..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* ÁREA DE ANEXO DE IMAGEM */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
                Anexar Print da Tela (Opcional)
              </label>
              
              {!previewUrl ? (
                <>
                  <button 
                    type="button"
                    className="btn-3d btn-3d-upload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    <ImageIcon size={20} style={{ marginRight: '8px' }}/>
                    Escolher Imagem
                  </button>
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }}
                    onChange={handleImageChange}
                  />
                </>
              ) : (
                <div className="image-preview-container">
                  <img src={previewUrl} alt="Preview do Feedback" className="image-preview" />
                  <button type="button" className="btn-remove-preview" onClick={removeImage} disabled={isSubmitting}>
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* BOTÃO MESTRE DE SUBMISSÃO */}
            <button 
              type="button" 
              className="btn-3d btn-3d-submit"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><Loader2 size={20} className="animate-spin" style={{ marginRight: '8px' }}/> Enviando...</>
              ) : (
                <><Send size={20} style={{ marginRight: '8px' }}/> Enviar Feedback</>
              )}
            </button>
            
          </div>
        </div>

      </div>
    </div>
  );
};

export default FeedbackModal;
