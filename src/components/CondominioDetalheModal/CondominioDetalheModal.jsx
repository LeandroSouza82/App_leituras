import { Building2, Calendar, Gauge, KeyRound, MapPin, Navigation, Phone, X } from 'lucide-react';
import './CondominioDetalheModal.css';

const formatDiaLeitura = (dia) => {
  const numero = Number(dia);
  return Number.isFinite(numero) && numero > 0 ? `Dia ${numero}` : 'Não informado';
};

const CondominioDetalheModal = ({ isOpen, onClose, condominio }) => {
  if (!isOpen || !condominio) {
    return null;
  }

  const {
    nome,
    tipoLeitura,
    instrucoesAcesso,
    endereco,
    contatoSindico,
    diaLeitura,
    completo,
  } = condominio;

  const handleOpenMaps = () => {
    const query = encodeURIComponent(endereco || nome);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
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
            <button type="button" className="btn-acao-maps" onClick={handleOpenMaps}>
              <Navigation size={16} />
              Abrir Rota no Google Maps
            </button>
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
