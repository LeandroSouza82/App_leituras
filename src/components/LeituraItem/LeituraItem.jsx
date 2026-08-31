import { useEffect, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';
import { Geolocation } from '@capacitor/geolocation';
import {
  Check, Gauge, KeyRound, Navigation, Pencil, Phone, Trash2,
  LocateFixed, Camera as CameraIcon, MoreHorizontal, Building2
} from 'lucide-react';
import './LeituraItem.css';
import ModalConfirmacao from '../ModalConfirmacao/ModalConfirmacao';
import ModalConfirmacaoDestrutiva from '../ModalConfirmacaoDestrutiva/ModalConfirmacaoDestrutiva';
import EditarCondominioModal from '../EditarCondominioModal/EditarCondominioModal';
import LeituraFotoModal from '../LeituraFotoModal/LeituraFotoModal';
import ContactActionModal from '../ContactActionModal/ContactActionModal';
import { supabase } from '../../services/supabaseClient';
import { customAlert } from '../CustomPrompt/CustomPrompt';
import Toast, { useToast } from '../Toast/Toast';

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

const LeituraItem = ({ leitura, onToggle, onDelete, onEdit, isFocused }) => {
  const diaAtual = new Date().getDate();
  const diaLeitura = extrairNumeroDia(leitura.diaLeitura);
  const [mostrarModalEdicao, setMostrarModalEdicao] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarModalDeletar, setMostrarModalDeletar] = useState(false);
  const [mostrarModalFoto, setMostrarModalFoto] = useState(false);
  const [capturandoGpsId, setCapturandoGpsId] = useState(null);
  const [modalContato, setModalContato] = useState(null);
  const [menuMaisAberto, setMenuMaisAberto] = useState(false);
  const menuRef = useRef(null);
  const { toast, showToast, dismissToast } = useToast();

  const { statusLabel, statusClass } = leitura.completo
    ? { statusLabel: 'Concluído', statusClass: 'status-success' }
    : diaLeitura !== null && diaAtual > diaLeitura
    ? { statusLabel: 'Atrasado', statusClass: 'status-danger' }
    : diaLeitura !== null && diaLeitura - diaAtual <= 2
    ? { statusLabel: 'Fazer Hoje/Breve', statusClass: 'status-warning' }
    : { statusLabel: `Aguardando`, statusClass: 'status-pending' };

  const badgeDayClass = leitura.completo
    ? 'badge-dia-success'
    : diaLeitura !== null && diaLeitura < diaAtual
    ? 'badge-dia-danger'
    : 'badge-dia-awaiting';

  const tituloModal = leitura.completo ? 'Desmarcar Leitura?' : 'Concluir Leitura?';
  const mensagemModal = leitura.completo
    ? `Tem certeza que deseja desmarcar a leitura do condomínio "${leitura.nome}"?`
    : `Deseja marcar a leitura do condomínio "${leitura.nome}" como concluída neste mês?`;

  // Fecha menu ao clicar fora
  useEffect(() => {
    if (!menuMaisAberto) return;
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuMaisAberto(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuMaisAberto]);

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
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setMenuMaisAberto(false);
    try {
      setCapturandoGpsId(leitura.id);
      let permStatus = await Geolocation.checkPermissions();
      if (permStatus.location !== 'granted') {
        permStatus = await Geolocation.requestPermissions();
      }
      if (permStatus.location !== 'granted') {
        await customAlert('Permissão de GPS negada. É necessário liberar o acesso para capturar a coordenada.', 'Permissão Necessária');
        setCapturandoGpsId(null);
        return;
      }
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      onEdit(leitura.id, { latitude: position.coords.latitude, longitude: position.coords.longitude });
      showToast('📍 Localização GPS salva com sucesso no aparelho!');
    } catch (error) {
      await customAlert('Erro no hardware de GPS ou permissão. Tente novamente em local aberto.', 'Erro de GPS');
    } finally {
      setCapturandoGpsId(null);
    }
  };

  const handleOpenMaps = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!leitura) return;
    let termoBusca = '';
    if (leitura.latitude && leitura.longitude) {
      termoBusca = `${leitura.latitude},${leitura.longitude}`;
    } else if (leitura.endereco && String(leitura.endereco).trim() !== '') {
      termoBusca = leitura.endereco.trim();
    } else {
      termoBusca = `${leitura.nome.trim()}, Grande Florianópolis - SC`;
    }
    const urlMapas = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(termoBusca)}`;
    try {
      await Browser.open({ url: urlMapas });
    } catch {
      window.open(urlMapas, '_blank');
    }
  };

  const abrirOpcoesContato = (contatoBruto) => {
    setModalContato(contatoBruto);
  };

  // Linha de texto secundário composta (aptos + instruções de acesso)
  const textoSecundario = [
    leitura.apartamentos ? `${leitura.apartamentos} aptos` : null,
    leitura.instrucoesAcesso || null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <article className={`item-card ${leitura.completo ? 'completed' : ''} ${isFocused ? 'focado-atrasado' : ''}`}>

        {/* ── LINHA 1: Ícone + Nome + Badge Dia ── */}
        <div className="item-row-top">
          <label className="item-toggle-label" onClick={handleCheckboxClick}>
            <span className={`checkbox ${leitura.completo ? 'checked' : ''}`}>
              {leitura.completo ? <Check size={13} /> : null}
            </span>
            <input type="checkbox" checked={Boolean(leitura.completo)} onChange={handleCheckboxClick} />
          </label>
          <Building2 size={18} className="item-icon-building" />
          <h2 className="item-nome">{leitura.nome}</h2>
          <span className={`badge-dia ${badgeDayClass}`}>Dia {leitura.diaLeitura}</span>
        </div>

        {/* ── LINHA 2: Badges de status e tipo ── */}
        <div className="item-row-badges">
          <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
          <span className="tipo-badge">
            <Gauge size={12} />
            {leitura.tipoLeitura || 'Água e Gás'}
          </span>
        </div>

        {/* ── LINHA 3: Texto secundário (aptos · instrução) ── */}
        {textoSecundario ? (
          <p className="item-secundario">{textoSecundario}</p>
        ) : null}

        {/* ── Contato do síndico (opcional) ── */}
        {leitura.contatoSindico && (
          <div className="info-extra">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirOpcoesContato(leitura.contatoSindico); }}
              className="btn-contato"
            >
              <Phone size={13} />
              <span>{leitura.contatoSindico}</span>
            </button>
          </div>
        )}

        {/* ── DIVISÓRIA ── */}
        <div className="item-divider" />

        {/* ── LINHA 4: Valor + Ações principais + Menu "..." ── */}
        <div className="item-row-actions">
          <span className="item-value">{formatCurrency(leitura.valor)}</span>

          <div className="item-btns">
            {/* Rota */}
            <button
              type="button"
              className="item-btn item-btn--maps"
              onClick={handleOpenMaps}
              title="Abrir no Google Maps"
            >
              <Navigation size={15} />
              <span>rota</span>
            </button>

            {/* Câmera */}
            <button
              type="button"
              className="item-btn item-btn--camera"
              onClick={(e) => { e.stopPropagation(); setMostrarModalFoto(true); }}
              title="Tirar foto da leitura"
            >
              <CameraIcon size={15} />
              <span>cam</span>
            </button>

            {/* Menu mais opções */}
            <div className="item-menu-mais" ref={menuRef}>
              <button
                type="button"
                className="item-btn item-btn--mais"
                onClick={() => setMenuMaisAberto((v) => !v)}
                title="Mais opções"
              >
                <MoreHorizontal size={16} />
              </button>

              {menuMaisAberto && (
                <div className="item-dropdown">
                  <button
                    type="button"
                    className="item-dropdown-item"
                    onClick={() => { setMenuMaisAberto(false); setMostrarModalEdicao(true); }}
                  >
                    <Pencil size={14} />
                    Editar
                  </button>
                  <button
                    type="button"
                    className="item-dropdown-item item-dropdown-item--gps"
                    onClick={salvarLocalizacaoGPS}
                    disabled={capturandoGpsId === leitura.id}
                  >
                    <LocateFixed size={14} />
                    {leitura.latitude && leitura.longitude ? 'Atualizar GPS' : 'Capturar GPS'}
                  </button>
                  <div className="item-dropdown-divider" />
                  <button
                    type="button"
                    className="item-dropdown-item item-dropdown-item--delete"
                    onClick={() => { setMenuMaisAberto(false); setMostrarModalDeletar(true); }}
                  >
                    <Trash2 size={14} />
                    Excluir
                  </button>
                </div>
              )}
            </div>
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
      <ModalConfirmacaoDestrutiva
        isOpen={mostrarModalDeletar}
        titulo="Excluir condomínio"
        mensagem="Tem certeza que deseja excluir este condomínio? Essa ação não pode ser desfeita."
        textoCancelar="Cancelar"
        textoConfirmar="Excluir"
        onConfirm={() => { onDelete(leitura.id); setMostrarModalDeletar(false); }}
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
      <ContactActionModal
        isOpen={!!modalContato}
        contatoBruto={modalContato}
        onClose={() => setModalContato(null)}
      />
      <Toast {...toast} onClose={dismissToast} />
    </>
  );
};

export default LeituraItem;
