import React from 'react';
import { AppLauncher } from '@capacitor/app-launcher';

const ContactActionModal = ({ isOpen, contatoBruto, onClose }) => {
  if (!isOpen || !contatoBruto) return null;

  const executarContato = async (tipo) => {
    const telefoneLimpo = contatoBruto.replace(/[^\d+]/g, '');
    if (!telefoneLimpo) {
      onClose();
      return;
    }
    
    if (tipo === 'whatsapp') {
      let numeroZap = telefoneLimpo;
      if (numeroZap.length === 10 || numeroZap.length === 11) numeroZap = `55${numeroZap}`;
      
      const intentUrl = `whatsapp://send?phone=${numeroZap}`;
      
      try {
        await AppLauncher.openUrl({ url: intentUrl });
      } catch (error) {
        window.location.href = `tel:${telefoneLimpo}`;
      }
    } else if (tipo === 'ligacao') {
      window.location.href = `tel:${telefoneLimpo}`;
    }
    
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#ffffff', borderRadius: '20px', padding: '24px',
          width: '100%', maxWidth: '340px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', gap: '12px'
        }}
      >
        <h3 style={{ margin: '0 0 4px 0', textAlign: 'center', color: '#1f2937', fontSize: '20px', fontWeight: 'bold' }}>
          Falar com Síndico
        </h3>
        <p style={{ margin: '0 0 16px 0', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
          Escolha o canal de atendimento:
        </p>

        {/* Botão WhatsApp Premium */}
        <button onClick={() => executarContato('whatsapp')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          backgroundColor: '#25D366', color: '#fff', border: 'none', borderRadius: '12px',
          padding: '14px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer'
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          WhatsApp
        </button>

        {/* Botão Ligação */}
        <button onClick={() => executarContato('ligacao')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          backgroundColor: '#3B82F6', color: '#fff', border: 'none', borderRadius: '12px',
          padding: '14px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer'
        }}>
          <span style={{ fontSize: '20px' }}>📞</span> 
          Ligação Normal
        </button>

        {/* Botão Cancelar */}
        <button onClick={onClose} style={{
          backgroundColor: 'transparent', color: '#6b7280', border: 'none', padding: '12px', 
          fontSize: '15px', fontWeight: 'bold', marginTop: '4px', cursor: 'pointer'
        }}>
          Cancelar
        </button>
      </div>
    </div>
  );
};

export default ContactActionModal;
