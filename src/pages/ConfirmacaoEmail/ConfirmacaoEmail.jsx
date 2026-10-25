import { useEffect, useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import './ConfirmacaoEmail.css';

const isMobileAndroid = () => /Android/i.test(navigator.userAgent);

const ConfirmacaoEmail = ({ verificacao }) => {
  const [resultado, setResultado] = useState({ estado: 'aguardando' });
  const [mostrarOrientacao, setMostrarOrientacao] = useState(false);

  useEffect(() => {
    let ativo = true;
    verificacao.then((valor) => { if (ativo) setResultado(valor); });
    return () => { ativo = false; };
  }, [verificacao]);

  const handleVoltar = () => {
    if (isMobileAndroid()) {
      // Tenta abrir o app pelo deep link já registrado no AndroidManifest.xml
      window.location.href = 'com.fastleituras.app://';
      // Se o app não for encontrado/aberto, o navegador permanece nesta página
      // (não há fallback de redirecionamento para evitar tela branca)
    } else {
      // Desktop: apenas orienta o usuário; não navega para lugar algum
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
          {resultado.estado === 'aguardando' ? (
            <p className="conf-email-text" role="status">Verificando a confirmação do seu e-mail...</p>
          ) : resultado.estado === 'erro' ? (
            <>
              <XCircle className="conf-email-icon conf-email-icon-error" size={64} />
              <h1 className="conf-email-title">Não foi possível confirmar o e-mail</h1>
              <p className="conf-email-text">
                {resultado.mensagem}
              </p>
            </>
          ) : (
            <>
              <CheckCircle className="conf-email-icon conf-email-icon-success" size={64} />
              <h1 className="conf-email-title">E-mail confirmado!</h1>
              <p className="conf-email-text">
                Sua conta do FAST LEITURAS foi ativada com sucesso.
              </p>
              <p className="conf-email-subtext">
                Agora você já pode voltar ao aplicativo e entrar com seu e-mail e senha.
              </p>
            </>
          )}
          {mostrarOrientacao ? (
            <p className="conf-email-subtext">
              Abra o FAST LEITURAS no seu celular para continuar.
            </p>
          ) : (
            <button className="conf-email-button" onClick={handleVoltar} disabled={resultado.estado === 'aguardando'}>
              Ir para o FAST LEITURAS
            </button>
          )}
        </div>
        <footer className="conf-email-footer">
          FAST LEITURAS<br/>
          Leituras simples, rápidas e seguras.
        </footer>
      </div>
    </main>
  );
};

export default ConfirmacaoEmail;
