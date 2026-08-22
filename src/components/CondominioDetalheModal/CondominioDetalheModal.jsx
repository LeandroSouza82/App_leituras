import { useState } from 'react';
import { Building2, Calendar, Gauge, KeyRound, MapPin, Navigation, Phone, X, LocateFixed } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import './CondominioDetalheModal.css';
import { supabase } from '../../services/supabaseClient';

// Extrai o primeiro número de um texto de dia (ex: "7 a 10" → 7, "Variado" → null)
const extrairNumeroDia = (diaTexto) => {
  if (!diaTexto) return null;
  const numeroString = String(diaTexto).match(/\d+/)?.[0];
  return numeroString ? Number.parseInt(numeroString, 10) : null;
};

const formatDiaLeitura = (dia) => {
  if (!dia) return 'Não informado';
  const numero = extrairNumeroDia(dia);
  return numero !== null ? `Dia ${numero}` : String(dia);
};

const CondominioDetalheModal = ({ isOpen, onClose, condominio }) => {
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [condominioAtualizado, setCondominioAtualizado] = useState(null);

  if (!isOpen || !condominio) {
    return null;
  }

  // Usa o condomínio atualizado (com GPS) se disponível, caso contrário usa o original
  const condominioExibido = condominioAtualizado || condominio;

  const {
    nome,
    tipoLeitura,
    instrucoesAcesso,
    endereco,
    contatoSindico,
    diaLeitura,
    completo,
  } = condominioExibido;

  const salvarLocalizacaoGPS = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      setCapturandoGps(true);

      // 1. Checa o status atual da permissão
      let permStatus = await Geolocation.checkPermissions();

      // 2. Se não tiver permissão, pede ao usuário (abre o popup nativo do Android)
      if (permStatus.location !== 'granted') {
        permStatus = await Geolocation.requestPermissions();
      }

      // 3. Se o usuário negar, avisa e aborta
      if (permStatus.location !== 'granted') {
        alert('Permissão de GPS negada. É necessário liberar o acesso para capturar a coordenada.');
        setCapturandoGps(false);
        return;
      }

      // 4. Com permissão garantida, captura a localização exata
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      // 1. Atualiza o objeto local com as coordenadas salvas (UI Instantânea)
      setCondominioAtualizado({
        ...condominioExibido,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
      });

      // 2. Persistência Offline-First (Garante a gravação sem internet)
      try {
        const cache = JSON.parse(localStorage.getItem('condominios_cache') || '[]');
        const novoCache = cache.map(c => String(c.id) === String(condominio.id) ? { ...c, latitude, longitude } : c);
        localStorage.setItem('condominios_cache', JSON.stringify(novoCache));
      } catch (e) {}

      // 3. Sincronização em Background (Silenciosa, não bloqueia o usuário)
      supabase
        .from('condominios')
        .update({ latitude, longitude })
        .eq('id', condominio.id)
        .then(() => {})
        .catch(() => {});

      alert('📍 Localização GPS salva com sucesso no aparelho!');
    } catch (error) {
      alert('Erro no hardware de GPS ou permissão. Tente novamente em local aberto.');
    } finally {
      setCapturandoGps(false);
    }
  };

  const handleOpenMaps = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!condominioExibido) return;

    let termoBusca = '';

    // 1ª Opção: Coordenadas de GPS gravadas no banco
    if (condominioExibido.latitude && condominioExibido.longitude) {
      termoBusca = `${condominioExibido.latitude},${condominioExibido.longitude}`;
    }
    // 2ª Opção: Endereço por extenso
    else if (endereco && String(endereco).trim() !== '') {
      termoBusca = endereco.trim();
    }
    // 3ª Opção: Nome do condomínio + Região
    else {
      termoBusca = `${nome.trim()}, Grande Florianópolis - SC`;
    }

    // Monta a URL da Search API do Google Maps com codificação segura
    const urlMapas = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(termoBusca)}`;

    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: urlMapas });
      } else {
        window.open(urlMapas, '_blank');
      }
    } catch (err) {
      window.open(urlMapas, '_blank');
    }
  };

  return (
    <div className="condominio-detalhe-overlay" onClick={onClose}>
      <div className="condominio-detalhe-container" onClick={(event) => event.stopPropagation()}>
        <div className="condominio-detalhe-header">
          <div className="condominio-detalhe-title">
            <Building2 size={20} />
            <h2>{nome || 'Condomínio'}</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="condominio-detalhe-body">
          <section className="detalhe-secao">
            <h3><Gauge size={16} /> Tipo de Medição</h3>
            <span className="tipo-medicao-badge">{tipoLeitura || 'Água e Gás'}</span>
          </section>

          <section className="detalhe-secao">
            <h3><KeyRound size={16} /> Instruções de Acesso / Portaria</h3>
            <p className={instrucoesAcesso ? '' : 'detalhe-vazio'}>
              {instrucoesAcesso || 'Nenhuma instrução informada.'}
            </p>
          </section>

          <section className="detalhe-secao">
            <h3><MapPin size={16} /> Endereço Completo</h3>
            <p className={endereco ? '' : 'detalhe-vazio'}>
              {endereco || 'Nenhum endereço informado.'}
            </p>
            <div className="detalhe-botoes-container">
              <button type="button" className="btn-acao-maps" onClick={handleOpenMaps}>
                <Navigation size={16} />
                Abrir Rota no Google Maps
              </button>
              <button 
                type="button" 
                className={`btn-acao-gps ${condominio.latitude && condominio.longitude ? 'gps-saved' : ''} ${capturandoGps ? 'gps-loading' : ''}`}
                onClick={salvarLocalizacaoGPS}
                disabled={capturandoGps}
                title={condominio.latitude && condominio.longitude ? 'GPS já capturado - Clique para atualizar' : 'Capturar localização GPS exata'}
              >
                <LocateFixed size={16} />
                Capturar GPS
              </button>
            </div>
          </section>

          <section className="detalhe-secao">
            <h3><Phone size={16} /> Contato do Síndico / Gestor</h3>
            {contatoSindico ? (
              <a className="btn-acao-telefone" href={`tel:${contatoSindico}`}>
                <Phone size={16} />
                {contatoSindico}
              </a>
            ) : (
              <p className="detalhe-vazio">Nenhum contato informado.</p>
            )}
          </section>

          <section className="detalhe-secao">
            <h3><Calendar size={16} /> Dia de Leitura / Status</h3>
            <div className="detalhe-status-linha">
              <span className="dia-leitura-badge">{formatDiaLeitura(diaLeitura)}</span>
              <span className={`status-badge-detalhe ${completo ? 'concluido' : 'pendente'}`}>
                {completo ? 'Concluído' : 'Pendente'}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CondominioDetalheModal;
