import { useState } from 'react';
import { supabase } from '../../services/supabase';
import './Equipes.css';

export default function AceitarConvite({ token, email, contaGoogle, onClose, onLogout }) {
  const [estado, setEstado] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function aceitar() {
    if (!contaGoogle || ocupado) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc('equipe_aceitar_convite', { p_token: token });
      if (!error && data === 'aceito') {
        onClose(true);
        return;
      }
      setEstado(!error && ['invalido', 'conta_incorreta'].includes(data) ? data : 'erro');
    } catch {
      setEstado('erro');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="convite-pagina">
      <section className="convite-cartao" aria-labelledby="aceitar-convite">
        <h1 id="aceitar-convite">Convite para a equipe</h1>
        <p>{contaGoogle ? 'Confira a conta Google que vai receber o acesso.' : 'Entre com o Google para aceitar. Se já tem cadastro, use o mesmo Gmail.'}</p>
        <p><strong>{email}</strong></p>
        {estado && <p role="alert">{{
          invalido: 'Este convite é inválido, expirou, foi cancelado ou já foi usado por outra conta. Peça um novo link ao gestor.',
          conta_incorreta: 'Entre com uma conta Google para aceitar o convite.',
          erro: 'Não foi possível aceitar o convite agora. Confira a conexão e tente de novo.',
        }[estado]}</p>}
        {contaGoogle && estado !== 'invalido' && (
          <button type="button" className="equipes-primario" disabled={ocupado} onClick={aceitar}>
            {ocupado ? 'Aceitando…' : 'Aceitar convite'}
          </button>
        )}
        <div className="equipes-acoes">
          <button type="button" className="equipes-secundario" disabled={ocupado} onClick={onLogout}>Trocar de conta</button>
          <button type="button" className="equipes-secundario" disabled={ocupado} onClick={() => onClose(false)}>Fechar</button>
        </div>
      </section>
    </main>
  );
}
