import { useState } from 'react';
import { supabase } from '../../services/supabase';
import './Equipes.css';

export default function AceitarConvite({ token, email, onClose, onLogout }) {
  const [estado, setEstado] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function aceitar() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc('equipe_aceitar_convite', { p_token: token });
      setEstado(!error && ['aceito', 'invalido', 'conta_incorreta'].includes(data) ? data : 'erro');
    } catch {
      setEstado('erro');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="convite-pagina">
      <section className="convite-cartao" aria-labelledby="aceitar-convite">
        <h1 id="aceitar-convite">{estado === 'aceito' ? 'Você já faz parte da equipe!' : 'Convite para a equipe'}</h1>
        {estado === 'aceito' ? (
          <>
            <p>Os condomínios que o gestor liberou estão na lista de leituras.</p>
            <button type="button" className="equipes-primario" onClick={onClose}>Ver meus condomínios</button>
          </>
        ) : (
          <>
            <p>O convite será vinculado à sua conta Google. Confira a conta antes de aceitar.</p>
            <p><strong>{email}</strong></p>
            {estado && <p role="alert">{{
              invalido: 'Este convite expirou, foi cancelado ou já está vinculado a outra conta.',
              conta_incorreta: 'Entre com uma conta Google para aceitar o convite.',
              erro: 'Não foi possível aceitar o convite agora. Confira a conexão e tente de novo.',
            }[estado]}</p>}
            {estado !== 'invalido' && (
              <button type="button" className="equipes-primario" disabled={ocupado} onClick={aceitar}>
                {ocupado ? 'Aceitando…' : 'Aceitar convite'}
              </button>
            )}
            <div className="equipes-acoes">
              <button type="button" className="equipes-secundario" disabled={ocupado} onClick={onLogout}>Trocar de conta</button>
              <button type="button" className="equipes-secundario" disabled={ocupado} onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
