import React, { useState, useRef } from 'react';
import { MessageSquare, X, Image as ImageIcon, Send, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import '../AReceberModal/AReceberModal.css'; // Herdando o design system do modal padrão (cabeçalho azul escuro, bordas)
import './FeedbackModal.css';

// Arquitetura: Função de Compressão Máxima Front-end
const compressImage = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        // Redimensionamento agressivo para max 800px
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compressão em JPEG 60% para máxima economia de Storage no Supabase
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Falha na compressão nativa'));
          },
          'image/jpeg',
          0.6 
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const FeedbackModal = ({ isOpen, onClose }) => {
  const [descricao, setDescricao] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Handler Cirúrgico do Input de Arquivo
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // Intercepta e espreme a imagem imediatamente após a seleção
      const compressedBlob = await compressImage(file);
      
      setImageFile(compressedBlob);
      setPreviewUrl(URL.createObjectURL(compressedBlob));
    } catch (error) {
      console.error("Erro na compressão:", error);
      alert("Houve um problema ao processar a imagem. Tente anexar novamente.");
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handler Mestre de Submissão para o Banco (Supabase)
  const handleSubmit = async () => {
    if (!descricao.trim()) {
      alert("A descrição é obrigatória. Por favor, detalhe seu feedback.");
      return;
    }

    setIsSubmitting(true);

    try {
      let finalImageUrl = null;

      // 1. Storage: Faz upload da imagem espremida se houver anexo
      if (imageFile) {
        const fileName = `feedbacks/bug_report_${Date.now()}.jpg`;
        
        const { error: uploadError } = await supabase.storage
          .from('app_anexos') // Substitua pelo nome exato do seu Bucket no Supabase
          .upload(fileName, imageFile, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error("Supabase Storage falhou:", uploadError);
          throw new Error("Erro ao subir a imagem para a nuvem.");
        }

        // Recupera o link público para atrelar ao banco
        const { data: publicData } = supabase.storage
          .from('app_anexos')
          .getPublicUrl(fileName);
          
        finalImageUrl = publicData.publicUrl;
      }

      // 2. Database: Registra o texto e a URL na tabela app_feedbacks
      const { error: insertError } = await supabase
        .from('app_feedbacks')
        .insert([
          {
            descricao: descricao.trim(),
            imagem_url: finalImageUrl,
            status: 'pendente'
            // user_id: opcional, adicione se houver uma gestão de sessão Auth ativa.
          }
        ]);

      if (insertError) {
        console.error("Supabase Insert falhou:", insertError);
        throw new Error("Erro ao registrar o feedback no banco de dados.");
      }

      // 3. Sucesso! Limpa o cache local e despede o usuário
      alert("Feedback enviado com sucesso! Muito obrigado por nos ajudar a melhorar o app.");
      setDescricao('');
      removeImage();
      onClose();

    } catch (error) {
      alert(error.message || "Houve um erro inesperado. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
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
