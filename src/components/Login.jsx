import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, LogIn, UserPlus, UserRound, Phone, KeyRound, ArrowLeft } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useGoogleLogin } from '@react-oauth/google';
import './Login.css';

const RecuperarSenhaModal = ({ isOpen, onClose }) => {
  const [etapa, setEtapa] = useState(1);
  const [emailRecuperacao, setEmailRecuperacao] = useState('');
  const [codigoOtp, setCodigoOtp] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (!isOpen) return null;

  const handleEnviarCodigo = async (e) => {
    e.preventDefault();
    if (!emailRecuperacao.includes('@')) {
      setFeedback({ tipo: 'erro', mensagem: 'Informe um e-mail válido.' });
      return;
    }

    setCarregando(true);
    setFeedback(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailRecuperacao);
      if (error) throw error;
      setEtapa(2);
      setFeedback({ tipo: 'sucesso', mensagem: 'Código de recuperação enviado para seu e-mail.' });
    } catch (err) {
      setFeedback({ tipo: 'erro', mensagem: err.message || 'Falha ao enviar código.' });
    } finally {
      setCarregando(false);
    }
  };

  const handleValidarETrocar = async (e) => {
    e.preventDefault();
    if (codigoOtp.length < 6 || novaSenha.length < 6) {
      setFeedback({ tipo: 'erro', mensagem: 'Código e senha devem ter pelo menos 6 caracteres.' });
      return;
    }

    setCarregando(true);
    setFeedback(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: emailRecuperacao,
        token: codigoOtp,
        type: 'recovery',
      });

      if (verifyError) throw verifyError;

      const { error: updateError } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (updateError) throw updateError;

      setFeedback({ tipo: 'sucesso', mensagem: 'Senha alterada com sucesso! Você já pode entrar.' });
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setFeedback({ tipo: 'erro', mensagem: err.message || 'Falha ao redefinir senha.' });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="login-modal-header">
          <button type="button" className="login-modal-back" onClick={() => (etapa === 2 ? setEtapa(1) : onClose())}>
            <ArrowLeft size={20} />
          </button>
          <h3>Recuperar Senha</h3>
        </header>

        {feedback && (
          <div className={`login-feedback login-feedback-${feedback.tipo} mb-4`} role="alert">
            {feedback.mensagem}
          </div>
        )}

        {etapa === 1 ? (
          <form className="login-form" onSubmit={handleEnviarCodigo}>
            <p className="login-modal-text">Insira seu e-mail para receber o código de 6 dígitos.</p>
            <label className="login-field">
              <span>E-mail</span>
              <div className="login-input-wrap">
                <Mail size={18} aria-hidden="true" />
                <input
                  type="email"
                  value={emailRecuperacao}
                  onChange={(e) => setEmailRecuperacao(e.target.value)}
                  placeholder="voce@exemplo.com"
                  disabled={carregando}
                  required
                />
              </div>
            </label>
            <button className="login-submit" type="submit" disabled={carregando}>
              {carregando ? 'Enviando...' : 'Enviar Código'}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleValidarETrocar}>
            <p className="login-modal-text">Insira o código enviado para <strong>{emailRecuperacao}</strong>.</p>
            <label className="login-field">
              <span>Código de 6 dígitos</span>
              <div className="login-input-wrap">
                <KeyRound size={18} aria-hidden="true" />
                <input
                  type="text"
                  value={codigoOtp}
                  onChange={(e) => setCodigoOtp(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  disabled={carregando}
                  required
                />
              </div>
            </label>
            <label className="login-field">
              <span>Nova Senha</span>
              <div className="login-input-wrap">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Nova senha (min. 6 caracteres)"
                  disabled={carregando}
                  required
                />
              </div>
            </label>
            <button className="login-submit" type="submit" disabled={carregando}>
              {carregando ? 'Processando...' : 'Alterar Senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const Login = ({ onLoginSuccess }) => {
  const [modoCadastro, setModoCadastro] = useState(false);
  const [showRecuperar, setShowRecuperar] = useState(false);
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // ── Fluxo WEB: usa popup nativo do @react-oauth/google
  const loginGoogleWeb = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setFeedback(null);
        // O access_token do Google é passado diretamente para o Supabase via signInWithIdToken
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: tokenResponse.access_token,
        });
        if (error) throw error;
        // O onAuthStateChange do App.jsx detecta a sessão automaticamente
      } catch (err) {
        console.error('Erro ao autenticar no Supabase (web):', err);
        setFeedback({ tipo: 'erro', mensagem: 'Falha ao autenticar com o Google. Tente novamente.' });
      }
    },
    onError: () => {
      setFeedback({ tipo: 'erro', mensagem: 'Login com o Google cancelado ou falhou.' });
    },
  });

  // ── Dispatcher: detecta ambiente e escolhe o fluxo correto
  const handleLoginGoogle = async () => {
    if (Capacitor.isNativePlatform()) {
      // 📱 APK / Android nativo: abre browser externo do sistema e retorna via deep link
      try {
        setCarregando(true);
        setFeedback(null);
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: 'com.fastleituras.app://',
            skipBrowserRedirect: true, // não redireciona no WebView
          },
        });
        if (error) throw error;
        if (data?.url) {
          await Browser.open({ url: data.url, presentationStyle: 'popover' });
        }
      } catch (error) {
        console.error('Erro no login nativo Google:', error);
        setFeedback({ tipo: 'erro', mensagem: 'Falha ao autenticar com o Google. Tente novamente.' });
      } finally {
        setCarregando(false);
      }
    } else {
      // 🖥️ Web: abre popup nativo do browser com @react-oauth/google
      loginGoogleWeb();
    }
  };

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
          
          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }}></div>
            <span style={{ padding: '0 10px', color: '#6b7280', fontSize: '14px', fontWeight: '500' }}>ou</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }}></div>
          </div>
          
          <button 
            type="button" 
            onClick={handleLoginGoogle}
            disabled={carregando}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              width: '100%', padding: '12px', backgroundColor: '#ffffff', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: '12px', fontSize: '15px',
              fontWeight: '600', cursor: carregando ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Entrar com o Google
          </button>
        </form>

        {!modoCadastro && (
          <button
            type="button"
            className="login-forgot-password"
            onClick={() => setShowRecuperar(true)}
            disabled={carregando}
          >
            Esqueci minha senha
          </button>
        )}

        <button className="login-mode-toggle" type="button" onClick={alternarModo} disabled={carregando}>
          {modoCadastro ? 'Já tenho uma conta' : 'Ainda não tenho uma conta'}
        </button>
      </section>

      <RecuperarSenhaModal
        isOpen={showRecuperar}
        onClose={() => setShowRecuperar(false)}
      />
    </main>
  );
};

export default Login;
