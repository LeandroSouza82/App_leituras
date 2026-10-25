import { useEffect, useState } from 'react';
import { CloudUpload, CheckCircle2, AlertCircle } from 'lucide-react';
import { lerEnvios, progressoTransferencia } from '../../services/ucondoTransferModel';
import { consultarEnviosUcondo, processarEnviosUcondo } from '../../services/ucondoTransferService';
import './TransferenciasUcondo.css';

export default function TransferenciasUcondo({ userId }) {
  const [locais, setLocais] = useState([]);
  const [remotos, setRemotos] = useState({ pedidos: [], trabalhos: [], lotes: [] });
  const [erro, setErro] = useState('');
  const [verHistorico, setVerHistorico] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  useEffect(() => {
    let encerrado = false, ocupado = false;
    const lerLocais = () => {
      try { if (!encerrado) setLocais(lerEnvios(userId)); }
      catch (e) { if (!encerrado) setErro(e.message); }
    };
    const atualizar = async () => {
      if (ocupado) return;
      ocupado = true;
      try {
        await processarEnviosUcondo(userId);
        const estado = await consultarEnviosUcondo(userId);
        if (!encerrado) { setRemotos(estado); setErro(''); }
      } catch {
        if (!encerrado) setErro('Sem atualização do servidor. As últimas contagens foram mantidas; seus dados locais continuam salvos.');
      } finally { ocupado = false; lerLocais(); }
    };
    lerLocais();
    void atualizar();
    const timer = setInterval(atualizar, 5000);
    window.addEventListener('envios_ucondo_atualizados', lerLocais);
    window.addEventListener('online', atualizar);
    return () => {
      encerrado = true;
      clearInterval(timer);
      window.removeEventListener('envios_ucondo_atualizados', lerLocais);
      window.removeEventListener('online', atualizar);
      // Accepted remote transfers deliberately continue after this unmount.
    };
  }, [userId]);
  const remotosIds = new Set(remotos.pedidos.map(p => p.id));
  const cards = remotos.pedidos.map(p => ({ id: p.id, nome: p.condominio_nome, periodo: p.periodo,
    ...progressoTransferencia(p, remotos.trabalhos, remotos.lotes.find(l => l.id === p.solicitacao_id)),
    erroPedido: p.mensagem, remoto: true }));
  const locaisPendentes = locais.filter(p => !remotosIds.has(p.serverId)).map(p => ({
    id: p.id, nome: p.nome, periodo: p.periodo, total: p.itens.length,
    sincronizadas: p.sincronizadas, completo: false, falhou: Boolean(p.erro), remoto: false,
    percentual: Math.min(99, Math.floor(p.sincronizadas * 100 / p.itens.length)),
    etapa: p.erro ? 'Precisa de atenção' : p.serverId ? 'Recebido pelo servidor' : 'Sincronizando com o servidor',
    detalhe: p.erro || (p.serverId ? 'O robô pode continuar na AWS. Aguardando o estado atualizado.'
      : 'Você pode continuar as leituras. Mantenha o app com internet até o servidor confirmar o recebimento.'),
  }));
  const todos = [...locaisPendentes, ...cards];
  const concluidos = todos.filter(p => p.completo);
  const ativos = todos.filter(p => !p.completo).sort((a,b) => Number(!a.atualizadoEm) - Number(!b.atualizadoEm));
  const visiveis = [...(verTodos ? ativos : ativos.slice(0,1)), ...(verHistorico ? concluidos : [])];
  if (!todos.length) return null;
  return <section className="ucondo-transferencias" aria-label="Envios para o uCondo">
    <div className="ucondo-transferencias-titulo"><CloudUpload size={20} /><strong>Envios para o uCondo</strong>
      {concluidos.length > 0 && <button type="button" onClick={() => setVerHistorico(v => !v)}>
        {verHistorico ? 'Ocultar concluídos' : `${concluidos.length} concluído(s)`}
      </button>}
    </div>
    {ativos.length > 1 && <button type="button" className="ucondo-ver-fila" onClick={() => setVerTodos(v => !v)}>
      {verTodos ? 'Recolher fila' : `Ver os ${ativos.length} envios em andamento ou na fila`}
    </button>}
    {erro && <p className="ucondo-transferencia-aviso" role="status">{erro}</p>}
    {visiveis.map(card => <article key={card.id} className={`ucondo-transferencia-card ${card.falhou ? 'tem-erro' : ''}`}>
      <div className="ucondo-transferencia-heading"><strong>{card.nome} · {card.periodo}</strong>
        {card.completo ? <CheckCircle2 size={18} /> : card.falhou ? <AlertCircle size={18} /> : null}
      </div>
      <p className="ucondo-transferencia-etapa">{card.etapa} <strong>{card.remoto ? 'Total ' : ''}{card.percentual}%</strong></p>
      <progress value={card.percentual} max="100" aria-label={`${card.nome}: ${card.etapa}`} />
      {card.remoto ? <p className="ucondo-transferencia-contagens">
        Leituras confirmadas: <strong>{card.leituras} de {card.total}</strong><br />
        Fotos confirmadas: <strong>{card.fotos} de {card.total}</strong>
      </p> : <p>Leituras e fotos sincronizadas: <strong>{card.sincronizadas} de {card.total}</strong></p>}
      <p className="ucondo-transferencia-detalhe">{card.erroPedido || card.detalhe}</p>
      {card.atualizadoEm && <p className="ucondo-transferencia-detalhe">Último sinal do robô: {new Date(card.atualizadoEm).toLocaleTimeString('pt-BR')}</p>}
    </article>)}
  </section>;
}
