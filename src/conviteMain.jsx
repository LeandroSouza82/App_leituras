import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, Smartphone } from 'lucide-react';
import logo from './assets/icon.png';
import { abrirConviteAndroid, lerTokenConvite, URL_CONVITE, urlApkOficial } from './services/conviteEquipe';
import './convite.css';

const apk = urlApkOficial(import.meta.env.VITE_FAST_LEITURAS_APK_URL)
  ?? urlApkOficial(import.meta.env.VITE_FAST_LEITURAS_ANDROID_URL)
  ?? 'https://github.com/LeandroSouza82/App_leituras/releases/download/v1.2.16/Fast-Leituras-1.2.16.apk';
const root = createRoot(document.getElementById('root'));

function atualizarConvite() {
  const { pathname, search, hash } = window.location;
  const token = lerTokenConvite(new URL(pathname + search + hash, URL_CONVITE));
  if (token && search) {
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
            <p>Instale ou atualize o aplicativo no Android para aceitar o convite e receber os condomínios da equipe.</p>
            <a className="equipes-primario" href={apk} referrerPolicy="no-referrer"><ArrowDownToLine size={19} /> Baixar APK para Android</a>
            <a className="equipes-secundario" href={abrirConviteAndroid(token)}><Smartphone size={19} /> Já instalei, abrir convite</a>
            <p>Depois de instalar, toque no mesmo link do WhatsApp. Se esta página continuar aberta, use o botão acima para abrir o convite no app.</p>
          </>
        ) : <p>Abra o link completo ou peça um novo convite ao responsável pela equipe.</p>}
      </section>
    </main>
  );
}

atualizarConvite();
window.addEventListener('hashchange', atualizarConvite);
