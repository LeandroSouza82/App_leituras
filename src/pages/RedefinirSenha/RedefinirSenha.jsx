import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, XCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../services/supabase';
import '../ConfirmacaoEmail/ConfirmacaoEmail.css';
import './RedefinirSenha.css';

const isMobileAndroid = () => /Android/i.test(navigator.userAgent);

const RedefinirSenha = () => {
  // 'aguardando' | 'formulario' | 'sucesso' | 'erro'
  const [etapa, setEtapa] = useState('aguardando');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [mostrarOrientacao, setMostrarOrientacao] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setEtapa('erro');
      return;
    }

    // Verifica se já há uma sessão ativa (ex: reload após recovery já estabelecido)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Limpa o hash/token da URL somente após sessão confirmada
        window.history.replaceState({}, document.title, '/redefinir-senha');
        setEtapa('formulario');
      }
    });

    // Escuta PASSWORD_RECOVERY disparado pelo SDK ao processar o hash de recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        // Limpa o hash/token da URL somente após sessão de recovery confirmada
        window.history.replaceState({}, document.title, '/redefinir-senha');
        setEtapa('formulario');
      }
    });

    // Timeout de segurança: se após 6s não houve sessão de recovery, o link é inválido
    const timeout = setTimeout(() => {
      setEtapa((atual) => (atual === 'aguardando' ? 'erro' : atual));
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);


  const handleSalvar = async (e) => {
    e.preventDefault();
    setErroForm('');

    if (novaSenha.length < 6) {
      setErroForm('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErroForm('As senhas não coincidem.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      setEtapa('sucesso');
    } catch {
      setErroForm('Não foi possível salvar a nova senha. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const handleAbrirApp = () => {
    if (isMobileAndroid()) {
      window.location.href = 'com.fastleituras.app://';
    } else {
      setMostrarOrientacao(true);
    }
  };

  return (
    <main className="conf-email-page">
      <div className="conf-email-card">
        <header className="conf-email-header">
          <h2>FAST LEITURAS</h2>
        </header>

        <div className="conf-email-body">
          {etapa === 'aguardando' && (
            <>
              <div className="rs-spinner" aria-label="Validando link..." />
              <p className="conf-email-text">Validando link de redefinição…</p>
            </>
          )}

          {etapa === 'erro' && (
            <>
              <XCircle className="conf-email-icon conf-email-icon-error" size={64} />
              <h1 className="conf-email-title">Não foi possível validar o link de redefinição.</h1>
              <p className="conf-email-text">
                Solicite um novo link pelo FAST LEITURAS.
              </p>
            </>
          )}

          {etapa === 'formulario' && (
            <>
              <ShieldCheck className="conf-email-icon conf-email-icon-success" size={64} />
              <h1 className="conf-email-title">Criar nova senha</h1>
              <p className="conf-email-text">Digite e confirme sua nova senha de acesso.</p>

              <form className="rs-form" onSubmit={handleSalvar} noValidate>
                <label className="rs-field">
                  <span>Nova senha</span>
                  <div className="rs-input-wrap">
                    <KeyRound size={17} aria-hidden="true" />
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="rs-toggle-senha"
                      onClick={() => setMostrarSenha((v) => !v)}
                      aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {mostrarSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>

                <label className="rs-field">
                  <span>Confirmar nova senha</span>
                  <div className="rs-input-wrap">
                    <KeyRound size={17} aria-hidden="true" />
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      placeholder="Repita a nova senha"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </label>

                {erroForm && (
                  <p className="rs-erro" role="alert">{erroForm}</p>
                )}

                <button
                  className="conf-email-button"
                  type="submit"
                  disabled={salvando}
                >
                  {salvando ? 'Salvando…' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}

          {etapa === 'sucesso' && (
            <>
              <ShieldCheck className="conf-email-icon conf-email-icon-success" size={64} />
              <h1 className="conf-email-title">Senha alterada com sucesso!</h1>
              <p className="conf-email-text">
                Agora você já pode entrar no FAST LEITURAS com sua nova senha.
              </p>
              {mostrarOrientacao ? (
                <p className="conf-email-subtext">
                  Abra o FAST LEITURAS no seu celular para entrar com a nova senha.
                </p>
              ) : (
                <button className="conf-email-button" onClick={handleAbrirApp}>
                  Ir para o FAST LEITURAS
                </button>
              )}
            </>
          )}
        </div>

        <footer className="conf-email-footer">
          FAST LEITURAS<br />
          Leituras simples, rápidas e seguras.
        </footer>
      </div>
    </main>
  );
};

export default RedefinirSenha;
