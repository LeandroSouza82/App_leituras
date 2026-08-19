import { useState } from 'react';
import { Browser } from '@capacitor/browser';
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

      console.log('[GPS] Coordenadas capturadas:', latitude, longitude);

      const { error } = await supabase
        .from('condominios')
        .update({ latitude, longitude })
        .eq('id', leitura.id);

      if (error) {
        alert('Erro ao salvar localização: ' + error.message);
      } else {
        alert('📍 Localização GPS salva com sucesso!');
        onEdit(leitura.id, { latitude, longitude });
      }
    } catch (error) {
      console.error('[GPS] Erro ao obter localização:', error);
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
            <h3 className="card-title">{leitura.nome}</h3>
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
            <div className="info-extra">
              <Phone size={13} />
              <a href={`tel:${leitura.contatoSindico}`} onClick={(e) => e.stopPropagation()}>
                {leitura.contatoSindico}
              </a>
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
    </>
  );
};

export default LeituraItem;
