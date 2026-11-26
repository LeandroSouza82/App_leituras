import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, Smartphone } from 'lucide-react';
import logo from './assets/icon.png';
import { abrirConviteAndroid, lerTokenConvite, URL_CONVITE, urlApkOficial } from './services/conviteEquipe';
import './components/Equipes/Equipes.css';

const apk = urlApkOficial(import.meta.env.VITE_FAST_LEITURAS_APK_URL)
  ?? urlApkOficial(import.meta.env.VITE_FAST_LEITURAS_ANDROID_URL);
const root = createRoot(document.getElementById('root'));

function atualizarConvite() {
  const token = lerTokenConvite(window.location.href);
  if (token && window.location.search) {
    window.history.replaceState(null, '', new URL(URL_CONVITE).pathname + '#token=' + token);
  }
  root.render(<PaginaConvite token={token} />);
}

function PaginaConvite({ token }) {
  return (
    <main className="convite-pagina">
      <section className="convite-cartao" aria-labelledby="convite-titulo">
        <img src={logo} width="72" height="72" alt="Fast Leituras" />
        <h1 id="convite-titulo">{token ? 'Você foi convidado para o Fast Leituras' : 'Convite indisponível'}</h1>
        {token ? (
          <>
            <p>Abra o aplicativo, entre com sua conta Google e aceite o convite. Os condomínios da sua equipe vão aparecer no app.</p>
            <a className="equipes-primario" href={abrirConviteAndroid(token)}><Smartphone size={19} /> Abrir o Fast Leituras</a>
            {apk ? (
              <>
                <a className="equipes-secundario" href={apk} referrerPolicy="no-referrer"><ArrowDownToLine size={19} /> Baixar o APK atualizado</a>
                <p>Depois de instalar no Android, volte a esta página e toque em <strong>Abrir o Fast Leituras</strong>.</p>
              </>
            ) : <p>Se ainda precisa instalar o app, peça o APK atualizado a quem enviou o convite. Depois, volte a este link.</p>}
            <p>Se abriu pelo WhatsApp e o botão não respondeu, abra este link no Chrome do Android.</p>
          </>
        ) : <p>Abra o link completo ou peça um novo convite ao responsável pela equipe.</p>}
      </section>
    </main>
  );
}

atualizarConvite();
window.addEventListener('hashchange', atualizarConvite);
