import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SideMenu from '../src/components/SideMenu/SideMenu';

function Preview() {
  const [aberto, setAberto] = useState(true);
  const [url, setUrl] = useState('');
  useEffect(() => {
    const handler = event => setUrl(event.detail);
    window.addEventListener('guia_link_aberto', handler);
    return () => window.removeEventListener('guia_link_aberto', handler);
  }, []);
  return <>
    <main style={{ padding:20,fontFamily:'system-ui',color:'#16324f' }}>
      <p><strong>Prévia de conferência</strong><br/>Sem login, envio de leituras ou abertura de links externos.</p>
      <button type="button" onClick={()=>setAberto(true)} style={{padding:14}}>Abrir Menu Principal</button>
      <p role="status">{url ? `Link conferido: ${url}` : 'Abra o menu e escolha Como usar o aplicativo.'}</p>
    </main>
    <SideMenu isOpen={aberto} onClose={()=>setAberto(false)} onLogout={()=>{}} onNavigate={()=>{}} />
  </>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
