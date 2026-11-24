import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './index.css';
import './components/Equipe/Equipe.css';

const CHAVE_CONVITE = 'fast-leituras-convite';
const CHAVE_CONVITE_ACEITO = 'fast-leituras-convite-aceito';
const tokenInicial = new URLSearchParams(window.location.hash.slice(1)).get('convite');
if (tokenInicial !== null) {
  sessionStorage.removeItem(CHAVE_CONVITE_ACEITO);
  if (/^[a-f0-9]{64}$/.test(tokenInicial)) sessionStorage.setItem(CHAVE_CONVITE, tokenInicial);
  else sessionStorage.removeItem(CHAVE_CONVITE);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    storage: sessionStorage,
    storageKey: 'fast-leituras-convite-auth',
    flowType: 'pkce',
  },
});

const token = sessionStorage.getItem(CHAVE_CONVITE);
const retornoGoogle = ['error', 'error_code'].some(chave => new URLSearchParams(window.location.search).has(chave));
const mensagemInvalido = 'Este convite expirou ou foi cancelado. Peça um novo link ao administrador.';

function obterLinkAndroid() {
  try {
    const link = new URL(import.meta.env.VITE_FAST_LEITURAS_ANDROID_URL);
    if (link.protocol === 'https:') return link.href;
  } catch (error) {
    // A distribuição pode ser administrada fora do portal.
  }
  return null;
}

function Convite() {
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(retornoGoogle ? 'A entrada com Google foi interrompida. Tente novamente.' : '');
  const [tentarNovamente, setTentarNovamente] = useState(0);
  const download = obterLinkAndroid();

  useEffect(() => {
    let ativo = true;

    async function concluir() {
      if (!token) {
        setEstado(sessionStorage.getItem(CHAVE_CONVITE_ACEITO) ? 'aceito' : 'invalido');
        return;
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!ativo) return;
        if (!data.session) {
          setEstado('login');
          return;
        }

        const { data: resultado, error: falha } = await supabase.rpc('equipe_aceitar_convite', { p_token: token });
        if (falha) throw falha;
        if (!ativo) return;
        if (resultado === 'aceito' || resultado === 'invalido') {
          sessionStorage.removeItem(CHAVE_CONVITE);
          if (resultado === 'aceito') sessionStorage.setItem(CHAVE_CONVITE_ACEITO, 'true');
          await supabase.auth.signOut({ scope: 'local' });
        }
        if (ativo) setEstado(resultado);
      } catch (falha) {
        if (ativo) {
          setErro('Não foi possível conferir o convite. Verifique a conexão e tente novamente.');
          setEstado('erro');
        }
      }
    }

    void concluir();
    return () => { ativo = false; };
  }, [tentarNovamente]);

  async function entrarComGoogle() {
    setErro('');
    setEstado('carregando');
    try {
      const { error: sairErro } = await supabase.auth.signOut({ scope: 'local' });
      if (sairErro && sairErro.name !== 'AuthSessionMissingError') throw sairErro;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (falha) {
      setErro('Não foi possível abrir o Google. Tente novamente.');
      setEstado('login');
    }
  }

  return (
    <main className="equipe-overlay">
      <section className="equipe-painel equipe-form" aria-labelledby="convite-titulo">
        <h2 id="convite-titulo">Convite para a Fast Leituras</h2>
        {estado === 'carregando' && <p role="status">Verificando seu convite…</p>}
        {erro && <p role="alert" className="equipe-aviso">{erro}</p>}
        {estado === 'invalido' && <p role="alert">{mensagemInvalido}</p>}
        {estado === 'conta_incorreta' && <p role="alert">Escolha uma conta Google para entrar na equipe.</p>}
        {(estado === 'login' || estado === 'conta_incorreta') && (
          <button className="equipe-primario" type="button" onClick={entrarComGoogle}>Continuar com Google</button>
        )}
        {estado === 'erro' && (
          <button className="equipe-primario" type="button" onClick={() => {
            setErro('');
            setEstado('carregando');
            setTentarNovamente(valor => valor + 1);
          }}>Tentar novamente</button>
        )}
        {estado === 'aceito' && (
          <>
            <p role="status">Você já faz parte da equipe. Entre no aplicativo com essa mesma conta Google.</p>
            <a className="equipe-primario" href="com.fastleituras.app://equipe">Abrir Fast Leituras</a>
            {download
              ? <a className="equipe-secundario" href={download}>Baixar para Android</a>
              : <p>Se ainda precisar instalar, peça o APK atualizado à pessoa que enviou o convite.</p>}
          </>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Convite />);
