import { useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { sincronizarFilaEmBackground } from '../../services/syncService';
import './Perfil.css';

const FALLBACK_USER = {
  id: 'fallback-user',
  name: 'Leiturista não identificado',
  email: 'leiturista@fastleitura.com.br',
  role: 'Leiturista',
  pix: '',
  phone: '',
};

const getInitials = (name) => String(name || '')
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join('') || 'L';

const getUserData = (user) => ({
  id: user?.id || FALLBACK_USER.id,
  name: user?.user_metadata?.full_name || user?.user_metadata?.name || FALLBACK_USER.name,
  email: user?.email || FALLBACK_USER.email,
  role: user?.user_metadata?.role || 'Leiturista',
  pix: user?.user_metadata?.pix || '',
  phone: user?.user_metadata?.phone || user?.phone || '',
});

const loadProfileData = async (userId) => {
  if (!userId || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('nome, celular, funcao')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
};

const Perfil = ({ onShowToast, onNavigate, onRefresh, onLogout }) => {
  const [user, setUser] = useState(FALLBACK_USER);
  const [pix, setPix] = useState('');
  const [phone, setPhone] = useState('');
  const [loadingUser, setLoadingUser] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      if (!supabase) {
        if (isMounted) {
          setLoadingUser(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase.auth.getUser();
        if (!isMounted) {
          return;
        }

        if (error || !data.user) {
          onShowToast('Sessão de teste ativa. Dados fictícios carregados.', 'success');
          setLoadingUser(false);
          return;
        }

        const profileData = await loadProfileData(data.user.id);
        const baseUser = getUserData(data.user);
        const userData = {
          ...baseUser,
          name: profileData?.nome || baseUser.name,
          phone: profileData?.celular || baseUser.phone,
          role: profileData?.funcao || baseUser.role,
        };

        setUser(userData);
        setPix(userData.pix);
        setPhone(userData.phone);
        setLoadingUser(false);
      } catch {
        if (isMounted) {
          setUser(FALLBACK_USER);
          setPix('');
          setPhone('');
          setLoadingUser(false);
        }
      }
    };

    loadUser();
    return () => {
      isMounted = false;
    };
  }, [onShowToast]);

  const initials = useMemo(() => getInitials(user.name), [user.name]);
  const perfilName = user.name || 'Leiturista não identificado';
  const perfilRole = user.role || 'Leiturista';

  const handleSaveData = async (event) => {
    event.preventDefault();
    setSaving(true);

    if (supabase && user.id !== FALLBACK_USER.id) {
      const { error } = await supabase.auth.updateUser({
        data: { pix: pix.trim(), phone: phone.trim() },
      });

      if (error) {
        onShowToast('Não foi possível salvar os dados agora.', 'error');
        setSaving(false);
        return;
      }
    }

    setUser((previous) => ({ ...previous, pix: pix.trim(), phone: phone.trim() }));
    onShowToast('Dados operacionais salvos com sucesso.');
    setSaving(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await sincronizarFilaEmBackground();
      await onRefresh();
      onShowToast('Fila processada e dados da nuvem atualizados.');
    } catch (error) {
      onShowToast('Erro ao atualizar os dados.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!supabase || user.id === FALLBACK_USER.id) {
      onShowToast('Configure o Supabase para alterar a senha.', 'error');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    onShowToast(
      error ? 'Não foi possível enviar o e-mail de alteração.' : 'Confira seu e-mail para alterar a senha.',
      error ? 'error' : 'success',
    );
  };

  const handleSignOut = async () => {
    if (onLogout) {
      const saiu = await onLogout();
      if (saiu === false) {
        onShowToast('Não foi possível sair da conta.', 'error');
      }
      return;
    }

    if (supabase && user.id !== FALLBACK_USER.id) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        onShowToast('Não foi possível sair da conta.', 'error');
        return;
      }
    }

    onShowToast('Você saiu da conta com sucesso.');
    onNavigate('dashboard');
  };

  return (
    <main className="perfil-page" aria-labelledby="perfil-title">
      <header className="perfil-header" style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: 'var(--primary-color)', padding: '24px 16px 16px', marginBottom: 0 }}>
        <div className="perfil-avatar" aria-hidden="true">
          {initials || <UserRound size={30} />}
        </div>
        <div className="perfil-heading">
          <span className="perfil-eyebrow">Minha conta</span>
          <h1 id="perfil-title">{loadingUser ? 'Leiturista não identificado' : perfilName}</h1>
          <div className="perfil-contact-line">
            <Mail size={15} aria-hidden="true" />
            <span>{user.email}</span>
          </div>
        </div>
        <span className="perfil-status"><span /> {perfilRole}</span>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: '100px' }}>
        <div style={{ width: 'min(100%, 760px)', margin: '0 auto' }}>

      <form className="perfil-card" onSubmit={handleSaveData}>
        <div className="perfil-card-heading">
          <div className="perfil-card-icon perfil-card-icon-blue"><WalletCards size={19} /></div>
          <div>
            <h2>Dados operacionais</h2>
            <p>Informações usadas para seus recebimentos.</p>
          </div>
        </div>
        <div className="perfil-fields">
          <label className="perfil-field">
            <span>Chave PIX</span>
            <input
              type="text"
              value={pix}
              onChange={(event) => setPix(event.target.value)}
              placeholder="CPF, e-mail ou chave aleatória"
              autoComplete="off"
            />
          </label>
          <label className="perfil-field">
            <span>Telefone de contato</span>
            <div className="perfil-input-with-icon">
              <Phone size={17} aria-hidden="true" />
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(00) 00000-0000"
                autoComplete="tel"
              />
            </div>
          </label>
        </div>
        <button className="perfil-button perfil-button-primary" type="submit" disabled={saving}>
          <Save size={17} aria-hidden="true" />
          {saving ? 'Salvando...' : 'Salvar dados'}
        </button>
      </form>

      <section className="perfil-card" aria-labelledby="perfil-sync-title">
        <div className="perfil-card-heading">
          <div className="perfil-card-icon perfil-card-icon-green"><Cloud size={19} /></div>
          <div>
            <h2 id="perfil-sync-title">Sincronização e sistema</h2>
            <p>Veja o estado da sua conexão e dos dados.</p>
          </div>
        </div>
        <div className="perfil-sync-status"><span /> Banco Supabase Sincronizado</div>
        <button className="perfil-button perfil-button-secondary" type="button" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'perfil-spin' : ''} size={17} aria-hidden="true" />
          {refreshing ? 'Atualizando...' : 'Forçar Sincronização'}
        </button>
        <p className="perfil-version">Fast Leitura Mobile <span>•</span> v1.0.0</p>
      </section>

      <section className="perfil-card" aria-labelledby="perfil-security-title">
        <div className="perfil-card-heading">
          <div className="perfil-card-icon perfil-card-icon-slate"><ShieldCheck size={19} /></div>
          <div>
            <h2 id="perfil-security-title">Segurança e acesso</h2>
            <p>Controle as credenciais da sua conta.</p>
          </div>
        </div>
        <button className="perfil-action-row" type="button" onClick={handlePasswordChange}>
          <KeyRound size={18} aria-hidden="true" />
          <span>Alterar senha de acesso</span>
          <strong aria-hidden="true">›</strong>
        </button>
        <button className="perfil-button perfil-button-danger" type="button" onClick={handleSignOut}>
          <LogOut size={17} aria-hidden="true" />
          Sair da conta
        </button>
      </section>
        </div>
      </div>
    </main>
  );
};

export default Perfil;
