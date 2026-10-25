import React from 'react';
import ReactDOM from 'react-dom/client';
import ConfirmacaoEmail from './pages/ConfirmacaoEmail/ConfirmacaoEmail';
import { createClient } from '@supabase/supabase-js';
import { lerRetornoConfirmacao, validarRetornoConfirmacao } from './services/emailConfirmationService';

const retorno = lerRetornoConfirmacao(window.location.href);
window.history.replaceState({}, document.title, '/confirmacao-email');
// Cliente exclusivo desta página: não abre uma sessão do app nem toca nos dados offline.
const cliente = createClient(
  String(import.meta.env.VITE_SUPABASE_URL || '').trim(),
  String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(),
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);
// Uma única consulta, inclusive sob React.StrictMode.
const verificacao = validarRetornoConfirmacao(cliente.auth, retorno);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfirmacaoEmail verificacao={verificacao} />
  </React.StrictMode>
);
