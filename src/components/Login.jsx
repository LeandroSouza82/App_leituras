import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, LogIn, UserPlus, UserRound, Phone } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
  const [modoCadastro, setModoCadastro] = useState(false);
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const emailNormalizado = email.trim();
    const nomeNormalizado = nomeCompleto.trim();
    const celularNormalizado = celular.trim();

    if (modoCadastro) {
      if (!nomeNormalizado || !celularNormalizado || !emailNormalizado || !emailNormalizado.includes('@') || senha.length < 6) {
        setFeedback({
          tipo: 'erro',
          mensagem: 'Informe nome completo, celular, e-mail válido e uma senha com pelo menos 6 caracteres.',
        });
        return;
      }
    } else if (!emailNormalizado || !emailNormalizado.includes('@') || senha.length < 6) {
      setFeedback({ tipo: 'erro', mensagem: 'Informe um e-mail válido e uma senha com pelo menos 6 caracteres.' });
      return;
    }

    if (!supabase) {
      setFeedback({ tipo: 'erro', mensagem: 'Não foi possível conectar ao Supabase. Verifique as variáveis do ambiente.' });
      return;
    }

    setCarregando(true);
    setFeedback(null);

    try {
      if (modoCadastro) {
        const { data, error } = await supabase.auth.signUp({
          email: emailNormalizado,
          password: senha,
          options: {
            data: {
              full_name: nomeNormalizado,
              phone: celularNormalizado,
              role: 'Leiturista',
            },
          },
        });

        if (error) throw error;

        setFeedback({
          tipo: 'sucesso',
          mensagem: data?.session
            ? 'Conta criada com sucesso!'
            : 'Conta criada! Confira seu e-mail para confirmar o acesso.',
        });

        if (data?.session && onLoginSuccess) {
          onLoginSuccess(data.session);
        }
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNormalizado,
        password: senha,
      });

      if (error) throw error;

      if (data?.session) {
        console.log('✅ Usuário autenticado com sucesso!');
        console.log('UUID do Usuário:', data.session.user.id);
        console.log('E-mail logado:', data.session.user.email);

        setFeedback({
          tipo: 'sucesso',
          mensagem: 'Login realizado com sucesso!',
        });

        if (onLoginSuccess) {
          onLoginSuccess(data.session);
        }
        return;
      }

      throw new Error('Sessão não foi retornada pelo Supabase.');
    } catch (err) {
      console.error('❌ Erro na autenticação:', err.message);
      setFeedback({
        tipo: 'erro',
        mensagem: err.message || 'Falha ao autenticar. Verifique seus dados.',
      });
    } finally {
      setCarregando(false);
    }
  };

  const alternarModo = () => {
    setModoCadastro((previous) => !previous);
    setFeedback(null);
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand-mark" aria-hidden="true"><LockKeyhole size={25} /></div>
        <span className="login-eyebrow">Fast Leitura</span>
        <h1 id="login-title">{modoCadastro ? 'Crie sua conta' : 'Bem-vindo de volta'}</h1>
        <p className="login-subtitle">
          {modoCadastro ? 'Cadastre-se para sincronizar suas leituras.' : 'Acesse seus condomínios e leituras.'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {feedback && (
            <div className={`login-feedback login-feedback-${feedback.tipo}`} role="alert">
              {feedback.mensagem}
            </div>
          )}

          {modoCadastro && (
            <>
              <label className="login-field">
                <span>Nome Completo</span>
                <div className="login-input-wrap">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    type="text"
                    value={nomeCompleto}
                    onChange={(event) => setNomeCompleto(event.target.value)}
                    placeholder="Seu nome completo"
                    autoComplete="name"
                    disabled={carregando}
                  />
                </div>
              </label>

              <label className="login-field">
                <span>Celular</span>
                <div className="login-input-wrap">
                  <Phone size={18} aria-hidden="true" />
                  <input
                    type="tel"
                    value={celular}
                    onChange={(event) => setCelular(event.target.value)}
                    placeholder="(00) 00000-0000"
                    autoComplete="tel"
                    disabled={carregando}
                  />
                </div>
              </label>
            </>
          )}

          <label className="login-field">
            <span>E-mail</span>
            <div className="login-input-wrap">
              <Mail size={18} aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                disabled={carregando}
              />
            </div>
          </label>

          <label className="login-field">
            <span>Senha</span>
            <div className="login-input-wrap">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="Mínimo de 6 caracteres"
                autoComplete={modoCadastro ? 'new-password' : 'current-password'}
                disabled={carregando}
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setMostrarSenha((previous) => !previous)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                disabled={carregando}
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <button className="login-submit" type="submit" disabled={carregando}>
            {modoCadastro ? <UserPlus size={18} /> : <LogIn size={18} />}
            {carregando ? 'Aguarde...' : modoCadastro ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <button className="login-mode-toggle" type="button" onClick={alternarModo} disabled={carregando}>
          {modoCadastro ? 'Já tenho uma conta' : 'Ainda não tenho uma conta'}
        </button>
      </section>
    </main>
  );
};

export default Login;
