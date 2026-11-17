import { useEffect, useState } from 'react';
import { avatarPerfilService } from '../../services/avatarPerfilService';

// O pai usa a conta e a URL como key: nunca reaproveitar a foto de outra conta.
export default function AvatarPerfil({ userId, nome, url }) {
  const [foto, setFoto] = useState(null);
  const [tentativa, setTentativa] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const iniciais = String(nome || '').split(' ').filter(Boolean).slice(0, 2)
    .map(parte => parte[0].toUpperCase()).join('') || 'L';

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    avatarPerfilService.carregar(userId, url, { atualizar: tentativa > 0 })
      .then(src => { if (ativo) setFoto(src); })
      .catch(() => { if (ativo) setFoto(null); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [userId, url, tentativa]);

  const falhou = () => {
    avatarPerfilService.limpar(userId);
    // Tenta a URL sem referenciador uma única vez; depois mostra as iniciais.
    setFoto(atual => atual?.startsWith('data:image/') ? url : null);
  };

  return <button type="button" className="perfil-avatar" disabled={carregando || !url}
    aria-label="Tentar carregar novamente a foto do perfil" title="Atualizar foto do perfil"
    onClick={() => setTentativa(valor => valor + 1)}>
    {foto ? <img src={foto} alt="Foto do perfil" referrerPolicy="no-referrer"
      className="perfil-avatar-img" onError={falhou} /> : iniciais}
  </button>;
}
