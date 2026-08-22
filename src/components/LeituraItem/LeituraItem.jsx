import { useState } from 'react';
import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';
import { Geolocation } from '@capacitor/geolocation';
import { Check, Gauge, KeyRound, Navigation, Pencil, Phone, Trash2, LocateFixed, Camera as CameraIcon } from 'lucide-react';
import './LeituraItem.css';
import ModalConfirmacao from '../ModalConfirmacao/ModalConfirmacao';
import EditarCondominioModal from '../EditarCondominioModal/EditarCondominioModal';
import LeituraFotoModal from '../LeituraFotoModal/LeituraFotoModal';
import { supabase } from '../../services/supabaseClient';

// Extrai o primeiro número de um texto de dia (ex: "7 a 10" → 7, "Variado" → null)
const extrairNumeroDia = (diaTexto) => {
  if (!diaTexto) return null;
  const numeroString = String(diaTexto).match(/\d+/)?.[0];
  return numeroString ? Number.parseInt(numeroString, 10) : null;
};

const formatCurrency = (value) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const formatDateBR = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString('pt-BR');
};

const LeituraItem = ({ leitura, onToggle, onDelete, onEdit, isFocused }) => {
  const diaAtual = new Date().getDate();
  const diaLeitura = extrairNumeroDia(leitura.diaLeitura);
  const [mostrarModalEdicao, setMostrarModalEdicao] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarModalDeletar, setMostrarModalDeletar] = useState(false);
  const [mostrarModalFoto, setMostrarModalFoto] = useState(false);
  const [capturandoGpsId, setCapturandoGpsId] = useState(null);
  const [modalContato, setModalContato] = useState(null);

  const { statusLabel, statusClass, statusEmoji } = leitura.completo
    ? { statusLabel: 'Concluído', statusClass: 'status-success', statusEmoji: '🟢' }
    : diaLeitura !== null && diaAtual > diaLeitura
    ? { statusLabel: 'Atrasado', statusClass: 'status-danger', statusEmoji: '🔴' }
    : diaLeitura !== null && diaLeitura - diaAtual <= 2
    ? { statusLabel: 'Fazer Hoje/Breve', statusClass: 'status-warning', statusEmoji: '🟡' }
    : { statusLabel: `Aguardando (Dia ${leitura.diaLeitura})`, statusClass: 'status-pending', statusEmoji: '⚪' };

  const badgeText = `Dia ${leitura.diaLeitura}`;
  const badgeDayClass = leitura.completo
    ? 'badge-dia-success'
    : diaLeitura !== null && diaLeitura < diaAtual
    ? 'badge-dia-danger'
    : 'badge-dia-awaiting';

  const tituloModal = leitura.completo ? 'Desmarcar Leitura?' : 'Concluir Leitura?';
  const mensagemModal = leitura.completo
    ? `Tem certeza que deseja desmarcar a leitura do condomínio "${leitura.nome}"?`
    : `Deseja marcar a leitura do condomínio "${leitura.nome}" como concluída neste mês?`;

  const handleCheckboxClick = (event) => {
    event.preventDefault();
    setMostrarModal(true);
  };

  const handleConfirmar = () => {
    onToggle(leitura.id);
    setMostrarModal(false);
  };

  const handleCancelar = () => {
    setMostrarModal(false);
  };

  const salvarLocalizacaoGPS = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      setCapturandoGpsId(leitura.id);

      // 1. Checa o status atual da permissão
      let permStatus = await Geolocation.checkPermissions();

      // 2. Se não tiver permissão, pede ao usuário (abre o popup nativo do Android)
      if (permStatus.location !== 'granted') {
        permStatus = await Geolocation.requestPermissions();
      }

      // 3. Se o usuário negar, avisa e aborta
      if (permStatus.location !== 'granted') {
        alert('Permissão de GPS negada. É necessário liberar o acesso para capturar a coordenada.');
        setCapturandoGpsId(null);
        return;
      }

      // 4. Com permissão garantida, captura a localização exata
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      // Chama a edição otimista (já tratada offline-first no useLeituras)
      onEdit(leitura.id, { latitude, longitude });
      alert('📍 Localização GPS salva com sucesso no aparelho!');
    } catch (error) {
      alert('Erro no hardware de GPS ou permissão. Tente novamente em local aberto.');
    } finally {
      setCapturandoGpsId(null);
    }
  };

  const handleOpenMaps = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!leitura) return;

    let termoBusca = '';

    // 1ª Opção: Coordenadas de GPS gravadas no banco
    if (leitura.latitude && leitura.longitude) {
      termoBusca = `${leitura.latitude},${leitura.longitude}`;
    }
    // 2ª Opção: Endereço por extenso
    else if (leitura.endereco && String(leitura.endereco).trim() !== '') {
      termoBusca = leitura.endereco.trim();
    }
    // 3ª Opção: Nome do condomínio + Região
    else {
      termoBusca = `${leitura.nome.trim()}, Grande Florianópolis - SC`;
    }

    // Monta a URL da Search API do Google Maps com segurança
    const urlMapas = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(termoBusca)}`;

    try {
      await Browser.open({ url: urlMapas });
    } catch {
      window.open(urlMapas, '_blank');
    }
  };

  // Apenas abre o modal bonitão guardando o número
  const abrirOpcoesContato = (contatoBruto) => {
    const telefoneLimpo = contatoBruto.replace(/[^\d+]/g, '');
    if (telefoneLimpo) setModalContato(telefoneLimpo);
  };

  // Executa a ação escolhida no modal
  const executarContato = async (tipo) => {
    if (!modalContato) return;
    
    if (tipo === 'whatsapp') {
      let numeroZap = modalContato;
      if (numeroZap.length === 10 || numeroZap.length === 11) numeroZap = `55${numeroZap}`;
      
      const intentUrl = `whatsapp://send?phone=${numeroZap}`;
      
      try {
        // Bypass COMPLETO da WebView: Comunica direto com a API Java/Kotlin do Android
        await AppLauncher.openUrl({ url: intentUrl });
      } catch (error) {
        // Fallback de segurança para o discador caso dê erro extremo
        window.location.href = `tel:${modalContato}`;
      }
    } else if (tipo === 'ligacao') {
      window.location.href = `tel:${modalContato}`;
    }
    
    setModalContato(null);
  };

  return (
    <>
    <article className={`item-card ${leitura.completo ? 'completed' : ''} ${isFocused ? 'focado-atrasado' : ''}`}>
      <label className="item-main">
        <span className={`checkbox ${leitura.completo ? 'checked' : ''}`}>
          {leitura.completo ? <Check size={14} /> : null}
        </span>
        <input type="checkbox" checked={Boolean(leitura.completo)} onChange={handleCheckboxClick} />
        <div className="item-info">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" />
                <path d="M9 7h1" />
                <path d="M14 7h1" />
                <path d="M9 11h1" />
                <path d="M14 11h1" />
                <path d="M9 15h1" />
                <path d="M14 15h1" />
                <path d="M10 21v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3" />
              </svg>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#1F2937' }}>
                {leitura.nome}
              </h2>
            </div>
            <span className={`badge-dia ${badgeDayClass}`}>{badgeText}</span>
          </div>
          <div className="item-info-top">
            <span className={`status-badge ${statusClass}`}>
              {statusEmoji} {statusLabel}
            </span>
          </div>

          <div className="tipo-leitura-tag">
            <Gauge size={14} />
            <span>{leitura.tipoLeitura || 'Água e Gás'}</span>
          </div>

          <p className="item-data">{leitura.apartamentos} aptos</p>

          {leitura.instrucoesAcesso && (
            <div className="info-extra">
              <KeyRound size={13} />
              <span>{leitura.instrucoesAcesso}</span>
            </div>
          )}

          {leitura.contatoSindico && (
            <div className="info-extra" style={{ margin: '8px 0' }}>
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  abrirOpcoesContato(leitura.contatoSindico);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#F0F8FF',
                  border: '1px dashed #93C5FD',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  color: '#1E3A8A',
                  fontWeight: 'bold',
                  marginTop: '4px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'inherit'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={14} />
                  <span style={{ color: '#93C5FD' }}>|</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <span>{leitura.contatoSindico}</span>
              </button>
            </div>
          )}
        </div>
      </label>

      <div className="item-actions">
        <div className="item-value">{formatCurrency(leitura.valor)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="btn-maps"
            onClick={handleOpenMaps}
            title="Abrir no Google Maps"
          >
            <Navigation size={16} />
          </button>
          <button
            type="button"
            className={`btn-gps ${leitura.latitude && leitura.longitude ? 'gps-saved' : ''} ${capturandoGpsId === leitura.id ? 'gps-loading' : ''}`}
            onClick={salvarLocalizacaoGPS}
            disabled={capturandoGpsId === leitura.id}
            title={leitura.latitude && leitura.longitude ? 'GPS já capturado - Clique para atualizar' : 'Capturar localização GPS exata'}
          >
            <LocateFixed size={16} />
          </button>
          <button
            type="button"
            className="btn-camera"
            onClick={(e) => { e.stopPropagation(); setMostrarModalFoto(true); }}
            title="Tirar foto da leitura"
          >
            <CameraIcon size={16} />
          </button>
          <button type="button" className="btn-editar" onClick={() => setMostrarModalEdicao(true)} title="Editar condomínio">
            <Pencil color="#1e88e5" size={16} />
          </button>
          <button type="button" className="delete-btn" onClick={() => setMostrarModalDeletar(true)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
    <ModalConfirmacao
      isOpen={mostrarModal}
      titulo={tituloModal}
      mensagem={mensagemModal}
      onConfirm={handleConfirmar}
      onCancel={handleCancelar}
    />
    <ModalConfirmacao
      isOpen={mostrarModalDeletar}
      titulo="Excluir Condomínio"
      mensagem="Tem certeza que deseja excluir este condomínio?"
      textoCancelar="Cancelar"
      textoConfirmar="Excluir"
      btnConfirmarClasse="btn-excluir"
      onConfirm={() => {
        onDelete(leitura.id);
        setMostrarModalDeletar(false);
      }}
      onCancel={() => setMostrarModalDeletar(false)}
    />
    <EditarCondominioModal
      isOpen={mostrarModalEdicao}
      onClose={() => setMostrarModalEdicao(false)}
      condominio={leitura}
      onSave={(id, dadosAtualizados) => onEdit(id, dadosAtualizados)}
    />
    <LeituraFotoModal
      isOpen={mostrarModalFoto}
      onClose={() => setMostrarModalFoto(false)}
      leitura={leitura}
    />
    
    {modalContato && (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          backgroundColor: '#ffffff', borderRadius: '20px', padding: '24px',
          width: '100%', maxWidth: '340px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
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
          <button onClick={() => setModalContato(null)} style={{
            backgroundColor: 'transparent', color: '#6b7280', border: 'none', padding: '12px', 
            fontSize: '15px', fontWeight: 'bold', marginTop: '4px', cursor: 'pointer'
          }}>
            Cancelar
          </button>
        </div>
      </div>
    )}
    </>
  );
};

export default LeituraItem;
