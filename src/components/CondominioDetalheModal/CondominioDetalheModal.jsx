import { useState } from 'react';
import { Building2, Calendar, Gauge, KeyRound, MapPin, Navigation, Phone, X, LocateFixed } from 'lucide-react';
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

  const salvarLocalizacaoGPS = async () => {
    if (!navigator.geolocation) {
      alert('Seu navegador/dispositivo não suporta geolocalização.');
      return;
    }

    setCapturandoGps(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        const { error } = await supabase
          .from('condominios')
          .update({ latitude, longitude })
          .eq('id', condominio.id);

        setCapturandoGps(false);

        if (error) {
          alert('Erro ao salvar localização: ' + error.message);
        } else {
          // Atualiza o objeto local com as coordenadas salvas
          setCondominioAtualizado({
            ...condominioExibido,
            latitude: Number.isFinite(latitude) ? latitude : null,
            longitude: Number.isFinite(longitude) ? longitude : null,
          });
          alert('📍 Localização GPS salva com sucesso!');
        }
      },
      () => {
        setCapturandoGps(false);
        alert('Não foi possível obter a localização. Verifique as permissões de GPS do aparelho.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleOpenMaps = () => {
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

    // Monta a URL da Search API do Google Maps com segurança
    const urlMapas = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(termoBusca)}`;

    // Abre em nova aba com flags de segurança
    window.open(urlMapas, '_blank', 'noopener,noreferrer');
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
