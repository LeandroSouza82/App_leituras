import { useEffect, useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import './ConfirmacaoEmail.css';

const ConfirmacaoEmail = () => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorFlag = sessionStorage.getItem('fast_leituras_confirmacao_erro');
    if (errorFlag) {
      setHasError(true);
      sessionStorage.removeItem('fast_leituras_confirmacao_erro');
    }
  }, []);

  const handleVoltar = () => {
    window.location.href = '/';
  };

  return (
    <main className="conf-email-page">
      <div className="conf-email-card">
        <header className="conf-email-header">
          <h2>FAST LEITURAS</h2>
        </header>
        <div className="conf-email-body">
          {hasError ? (
            <>
              <XCircle className="conf-email-icon conf-email-icon-error" size={64} />
              <h1 className="conf-email-title">Não foi possível confirmar o e-mail</h1>
              <p className="conf-email-text">
                O link pode ter expirado ou já ter sido utilizado.<br/>
                Volte ao FAST LEITURAS e tente novamente.
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
          <button className="conf-email-button" onClick={handleVoltar}>
            Ir para o FAST LEITURAS
          </button>
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
