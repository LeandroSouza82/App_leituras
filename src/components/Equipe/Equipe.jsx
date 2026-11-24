import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { abrirWhatsAppComConvite, chamarEquipe, criarLinkConvite } from '../../services/equipeConviteService.js';
import { exportarHistoricoEquipe } from '../../services/equipeHistoricoService.js';
import { getCurrentMonthKey } from '../../utils/mesLeituras.js';
import ModalConfirmacao from '../ModalConfirmacao/ModalConfirmacao';
import './Equipe.css';

export default function Equipe({ condominios, onClose, onOpenPhotos }) {
  const [selecionados, setSelecionados] = useState(() => condominios.length === 1 ? [condominios[0].id] : []);
  const [membros, setMembros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [ultimoLink, setUltimoLink] = useState('');
  const [revogar, setRevogar] = useState(null);
  const [membroEditado, setMembroEditado] = useState(null);
  const [condominioHistorico, setCondominioHistorico] = useState('');
  const [mesHistorico, setMesHistorico] = useState(getCurrentMonthKey);

  useEffect(() => {
    let ativo = true;
    function atualizarMembros() {
      if (document.visibilityState === 'hidden') return;
      chamarEquipe('equipe_listar_convites')
        .then(lista => { if (ativo) setMembros(lista || []); })
        .catch(falha => { if (ativo) setErro(falha.message); })
        .finally(() => { if (ativo) setCarregando(false); });
    }
    atualizarMembros();
    document.addEventListener('visibilitychange', atualizarMembros);
    return () => {
      ativo = false;
      document.removeEventListener('visibilitychange', atualizarMembros);
    };
  }, []);

  async function executar(acao) {
    setOcupado(true);
    setErro('');
    setMensagem('');
    try {
      await acao();
    } catch (falha) {
      setErro(falha.message || 'Não foi possível concluir. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  function alternarCondominio(id) {
    setSelecionados(atuais => atuais.includes(id)
      ? atuais.filter(condominio => condominio !== id)
      : [...atuais, id]);
  }

  function convidar(event) {
    event.preventDefault();
    void executar(async () => {
      const token = await chamarEquipe('equipe_criar_convite', {
        p_condominios: selecionados,
      });
      const link = criarLinkConvite(token);
      setUltimoLink(link);
      try {
        await abrirWhatsAppComConvite(link);
      } finally {
        setMembros(await chamarEquipe('equipe_listar_convites') || []);
      }
    });
  }

  function editarCondominios(membro) {
    setMembroEditado(membro);
    setSelecionados(membro.condominio_ids);
  }

  function salvarCondominios(event) {
    event.preventDefault();
    void executar(async () => {
      await chamarEquipe('equipe_atualizar_condominios', {
        p_convite_id: membroEditado.id,
        p_condominios: selecionados,
      });
      setMembroEditado(null);
      setMembros(await chamarEquipe('equipe_listar_convites') || []);
      setMensagem('Condomínios atualizados.');
    });
  }

  function confirmarRevogacao() {
    const convite = revogar;
    setRevogar(null);
    void executar(async () => {
      await chamarEquipe('equipe_revogar_acesso', { p_convite_id: convite.id });
      setMembros(await chamarEquipe('equipe_listar_convites') || []);
      if (membroEditado?.id === convite.id) setMembroEditado(null);
      setMensagem(convite.ativo ? 'Acesso encerrado.' : 'Convite cancelado.');
    });
  }

  return createPortal(
    <div className="equipe-overlay">
      <section className="equipe-painel" role="dialog" aria-modal="true" aria-labelledby="equipe-titulo">
        <header className="equipe-cabecalho">
          <h2 id="equipe-titulo">Equipe</h2>
          <button type="button" className="equipe-fechar" aria-label="Fechar equipe" onClick={onClose}><X size={22} /></button>
        </header>
        {erro && <p role="alert" className="equipe-aviso">{erro}</p>}
        {mensagem && <p role="status">{mensagem}</p>}
        <form onSubmit={membroEditado ? salvarCondominios : convidar} className="equipe-form">
          <h3>{membroEditado ? 'Condomínios de ' + membroEditado.email : 'Convidar leiturista'}</h3>
          <fieldset>
            <legend>Condomínios que o leiturista pode atender</legend>
            {condominios.length === 0 && <p>Cadastre um condomínio na sua conta para convidar um leiturista.</p>}
            {condominios.map(condominio =>
              <label className="equipe-check" key={condominio.id}>
                <input type="checkbox" checked={selecionados.includes(condominio.id)} onChange={() => alternarCondominio(condominio.id)} />
                {condominio.nome}
              </label>
            )}
          </fieldset>
          <button type="submit" className="equipe-primario" disabled={ocupado || carregando || (!membroEditado && selecionados.length === 0)}>
            {membroEditado ? 'Salvar condomínios' : 'Convidar pelo WhatsApp'}
          </button>
          {membroEditado && <button type="button" className="equipe-secundario" onClick={() => setMembroEditado(null)}>Cancelar alteração</button>}
          {!membroEditado && ultimoLink && (
            <button type="button" className="equipe-secundario" disabled={ocupado}
              onClick={() => void executar(() => abrirWhatsAppComConvite(ultimoLink))}>Compartilhar último convite</button>
          )}
        </form>
        <section className="equipe-lista" aria-labelledby="equipe-membros-titulo">
          <h3 id="equipe-membros-titulo">Leituristas e convites</h3>
          {carregando ? <p role="status">Carregando equipe…</p> : membros.length === 0 && <p>Nenhum convite ativo.</p>}
          {membros.map(membro =>
            <div className="equipe-membro" key={membro.id}>
              <div>
                <strong>{membro.email || 'Aguardando aceite'}</strong>
                <p>{membro.condominios.join(', ') || 'Aguardando liberação de condomínios'}</p>
              </div>
              {membro.ativo && <button type="button" className="equipe-secundario" onClick={() => editarCondominios(membro)} disabled={ocupado}>Alterar condomínios</button>}
              <button type="button" className="equipe-secundario" onClick={() => setRevogar(membro)} disabled={ocupado}>
                {membro.ativo ? 'Remover acesso' : 'Cancelar convite'}
              </button>
            </div>
          )}
        </section>
        {condominios.length > 0 &&
          <form className="equipe-form" onSubmit={event => {
            event.preventDefault();
            const condominio = condominios.find(item => item.id === condominioHistorico);
            if (condominio) void executar(() => exportarHistoricoEquipe(condominio, mesHistorico));
          }}>
            <h3>Histórico da equipe</h3>
            <button type="button" className="equipe-secundario" onClick={onOpenPhotos}>Ver fotos sincronizadas</button>
            <label>
              Condomínio
              <select value={condominioHistorico} onChange={event => setCondominioHistorico(event.target.value)} required>
                <option value="">Selecione</option>
                {condominios.map(condominio => <option value={condominio.id} key={condominio.id}>{condominio.nome}</option>)}
              </select>
            </label>
            <label>
              Mês de coleta
              <input type="month" value={mesHistorico} onChange={event => setMesHistorico(event.target.value)} required />
            </label>
            <button type="submit" className="equipe-primario" disabled={ocupado || !condominioHistorico}>Exportar Excel</button>
          </form>
        }
      </section>
      <ModalConfirmacao
        isOpen={Boolean(revogar)}
        titulo={revogar?.ativo ? 'Remover acesso' : 'Cancelar convite'}
        mensagem={revogar?.ativo
          ? 'Remover o acesso de ' + revogar.email + '? As leituras e fotos sincronizadas continuam disponíveis para você.'
          : 'Cancelar este link de convite?'}
        onConfirm={confirmarRevogacao}
        onCancel={() => setRevogar(null)}
        textoConfirmar={revogar?.ativo ? 'Remover acesso' : 'Cancelar convite'}
        textoCancelar="Voltar"
      />
    </div>,
    document.body
  );
}
