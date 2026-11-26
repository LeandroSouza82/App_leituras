import { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { buscarCondominios } from '../../services/condominioService';
import { abrirWhatsAppComConvite } from '../../services/equipeConviteService';
import { sincronizarLeiturasAnterioresOffline } from '../../services/syncOfflineService';
import { getCurrentMonthKey } from '../../utils/mesLeituras';
import {
  abrirFotoEquipe, atualizarCondominiosEquipe, buscarLeiturasEquipe, criarConviteEquipe,
  listarAutoresEquipe, listarConvitesEquipe, revogarConviteEquipe,
} from '../../services/equipeService';
import './Equipes.css';

function Equipes({ userId, onClose }) {
  const dialog = useRef(null);
  const dialogFoto = useRef(null);
  const [condominios, setCondominios] = useState([]);
  const [convites, setConvites] = useState([]);
  const [autores, setAutores] = useState([]);
  const [membro, setMembro] = useState(null);
  const [selecionados, setSelecionados] = useState([]);
  const [link, setLink] = useState('');
  const [mes, setMes] = useState(getCurrentMonthKey);
  const [condominio, setCondominio] = useState('');
  const [autor, setAutor] = useState('');
  const [leituras, setLeituras] = useState(null);
  const [foto, setFoto] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const voltar = useRef(null);
  voltar.current = () => (foto ? setFoto(null) : onClose());

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let saiu = false, backListener;
    CapacitorApp.addListener('backButton', () => voltar.current()).then(listener => {
      if (saiu) listener.remove(); else backListener = listener;
    });
    return () => {
      saiu = true;
      backListener?.remove();
    };
  }, []);

  async function executar(acao) {
    setErro('');
    setOcupado(true);
    try {
      await acao();
    } catch (error) {
      setErro(error?.message || 'Não foi possível concluir. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
    let ativo = true;
    Promise.all([buscarCondominios(), listarConvitesEquipe(), listarAutoresEquipe()])
      .then(([condos, convitesAtivos, pessoas]) => {
        if (!ativo) return;
        setCondominios(condos.filter(c => c.administradorId === userId));
        setConvites(convitesAtivos);
        setAutores(pessoas.filter(pessoa => pessoa.id !== userId));
      })
      .catch(() => { if (ativo) setErro('Não foi possível carregar as equipes. Confira a conexão.'); });
    return () => { ativo = false; };
  }, [userId]);

  useEffect(() => {
    if (!foto) return;
    if (!dialogFoto.current.open) dialogFoto.current.showModal();
    return () => URL.revokeObjectURL(foto.url);
  }, [foto]);

  function editarConvite(convite) {
    setLink('');
    setMembro(convite);
    setSelecionados(convite?.condominio_ids || []);
  }

  async function salvarSelecao() {
    const selecionadosAgora = condominios.filter(c => selecionados.includes(c.id));
    await executar(async () => {
      await sincronizarLeiturasAnterioresOffline();
      if (membro) {
        await atualizarCondominiosEquipe(membro.id, selecionadosAgora, membro.condominio_ids);
      } else {
        const url = await criarConviteEquipe(selecionadosAgora);
        setLink(url);
      }
      setMembro(null);
      setSelecionados([]);
      setConvites(await listarConvitesEquipe());
    });
  }

  async function exportarPlanilha() {
    if (!leituras?.length) return;
    await executar(async () => {
      const { exportarPlanilhaEquipe } = await import('../../services/planilhaEquipe');
      const nome = condominios.find(c => c.id === condominio)?.nome || 'Condominio';
      await exportarPlanilhaEquipe(leituras, nome, mes, autores.find(pessoa => pessoa.id === autor)?.email);
    });
  }

  return (
    <dialog className="equipes-dialog" ref={dialog} onCancel={onClose} aria-labelledby="equipes-titulo">
      <header>
        <h2 id="equipes-titulo">Equipes</h2>
        <button type="button" className="equipes-secundario" onClick={onClose}>Fechar</button>
      </header>
      {erro && <p role="alert" className="equipes-erro">{erro}</p>}
      <section>
        <h3>Acessos da equipe</h3>
        {convites.map(convite => (
          <article key={convite.id} className="equipes-membro">
            <strong>{convite.email || 'Convite pendente'}</strong>
            <p>{convite.condominios.join(', ') || 'Nenhum condomínio liberado'}</p>
            <div className="equipes-acoes">
              {convite.ativo && <button className="equipes-secundario" disabled={ocupado} onClick={() => editarConvite(convite)}>Editar condomínios</button>}
              <button className="equipes-secundario" disabled={ocupado} onClick={() => executar(async () => {
                if (!window.confirm(convite.ativo ? 'Remover o acesso deste membro?' : 'Cancelar este convite?')) return;
                await revogarConviteEquipe(convite.id);
                editarConvite(null);
                setConvites(await listarConvitesEquipe());
                setAutores((await listarAutoresEquipe()).filter(pessoa => pessoa.id !== userId));
              })}>{convite.ativo ? 'Remover acesso' : 'Cancelar convite'}</button>
            </div>
          </article>
        ))}
        <fieldset disabled={ocupado}>
          <legend>{membro ? 'Condomínios do membro' : 'Novo convite'}</legend>
          <div className="equipes-lista">
            {condominios.map(c => (
              <label key={c.id}>
                <input type="checkbox" checked={selecionados.includes(c.id)} onChange={({ target }) =>
                  setSelecionados(atuais => target.checked ? [...atuais, c.id] : atuais.filter(id => id !== c.id))
                } />
                <span>{c.nome}<small>{c.tipoLeitura} · Dia {c.diaLeitura || 'a combinar'}</small></span>
              </label>
            ))}
          </div>
          <div className="equipes-acoes">
            <button className="equipes-primario" disabled={!membro && !selecionados.length} onClick={salvarSelecao}>
              {membro ? 'Salvar condomínios' : 'Criar convite'}
            </button>
            {membro && <button className="equipes-secundario" onClick={() => editarConvite(null)}>Voltar ao novo convite</button>}
          </div>
        </fieldset>
        {link && (
          <div className="equipes-acoes">
            <button className="equipes-primario" onClick={() => executar(() => abrirWhatsAppComConvite(link))}>Convidar pelo WhatsApp</button>
            <button className="equipes-secundario" onClick={() => navigator.clipboard.writeText(link)
              .then(() => setErro('')).catch(() => setErro('Selecione o link abaixo para copiá-lo.'))}>Copiar link</button>
            <input aria-label="Link do convite" value={link} readOnly onFocus={event => event.target.select()} />
          </div>
        )}
      </section>
      <section>
        <h3>Planilhas e fotos</h3>
        <form className="equipes-filtros" onSubmit={(event) => {
          event.preventDefault();
          setLeituras(null);
          setFoto(null);
          executar(async () => setLeituras(await buscarLeiturasEquipe(condominio, autor, mes)));
        }}>
          <div>
            <label htmlFor="equipes-autor">Leiturista</label>
            <select id="equipes-autor" value={autor} disabled={ocupado} onChange={(event) => { setAutor(event.target.value); setLeituras(null); setFoto(null); }} required>
              <option value="">Selecione</option>
              {autores.map(pessoa => <option key={pessoa.id} value={pessoa.id}>{pessoa.email}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="equipes-condominio">Condomínio</label>
            <select id="equipes-condominio" value={condominio} disabled={ocupado} onChange={(event) => { setCondominio(event.target.value); setLeituras(null); setFoto(null); }} required>
              <option value="">Selecione</option>
              {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="equipes-mes">Mês</label>
            <input id="equipes-mes" type="month" value={mes} disabled={ocupado} onChange={(event) => { setMes(event.target.value); setLeituras(null); setFoto(null); }} required />
          </div>
          <button className="equipes-primario" disabled={ocupado || !autor || !condominio || !mes}>Consultar</button>
        </form>
        {ocupado && <p role="status">Aguarde…</p>}
        {leituras?.length === 0 && <p>Nenhuma leitura sincronizada para esse período.</p>}
        {leituras?.length > 0 && (
          <>
            <div className="equipes-acoes">
              <span>{leituras.length} leitura(s) · {leituras.filter(l => l.foto_url).length} foto(s)</span>
              <button className="equipes-secundario" disabled={ocupado} onClick={exportarPlanilha}>Exportar planilha</button>
            </div>
            <ul className="equipes-leituras">
              {leituras.map(l => (
                <li key={l.id}>
                  <span><strong>{l.unidade_id}</strong> · {l.servico} · {l.dispensada
                    ? <span className="equipes-dispensada">Dispensada</span>
                    : Number(l.leitura_atual).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                  {l.foto_url && <button className="equipes-secundario" disabled={ocupado} onClick={() =>
                    executar(async () => setFoto({ url: await abrirFotoEquipe(l.foto_url), unidade: l.unidade_id, servico: l.servico }))
                  }>Ver foto</button>}
                </li>
              ))}
            </ul>
          </>
        )}
        {foto && (
          <dialog className="equipes-foto" ref={dialogFoto} aria-label={'Foto da unidade ' + foto.unidade}
            onCancel={(event) => { event.preventDefault(); setFoto(null); }}>
            <header>
              <strong>{foto.unidade} · {foto.servico}</strong>
              <button type="button" className="equipes-secundario" autoFocus onClick={() => setFoto(null)}>Fechar foto</button>
            </header>
            <img src={foto.url} alt={'Medidor da unidade ' + foto.unidade} />
          </dialog>
        )}
      </section>
    </dialog>
  );
}

export default Equipes;
