import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TransferenciasUcondo from '../src/components/TransferenciasUcondo/TransferenciasUcondo';

function Preview() {
  const [valor, setValor] = useState('');
  const [fotos, setFotos] = useState(0);
  return <main style={{maxWidth:460,margin:'auto',fontFamily:'system-ui',color:'#16324f'}}>
    <p style={{padding:12,background:'#fff1c7',borderRadius:10}}><strong>Prévia com dados fictícios</strong><br/>Esta tela não envia nada ao servidor nem ao uCondo.</p>
    <h1 style={{fontSize:25,padding:'0 16px'}}>Fast Leituras</h1>
    <TransferenciasUcondo userId="preview" />
    <section style={{margin:16,padding:16,border:'1px solid #cbd5e1',borderRadius:14,background:'white'}}>
      <h2 style={{fontSize:20}}>Próximo condomínio</h2><p>Residencial Palmeiras · apartamento 101</p>
      <label htmlFor="leitura">Leitura atual</label>
      <input id="leitura" value={valor} onChange={e=>setValor(e.target.value)} inputMode="decimal" style={{boxSizing:'border-box',width:'100%',padding:12,marginTop:8,fontSize:19,border:'1px solid #91adbd',borderRadius:8}} />
      <button type="button" onClick={()=>setFotos(v=>v+1)} style={{padding:12,width:'100%',marginTop:12,background:'#16324f',color:'white',border:0,borderRadius:8,fontSize:16}}>Tirar foto de teste</button>
      <p role="status">{fotos ? `${fotos} foto(s) de teste salva(s). Leitura digitada: ${valor || 'pendente'}.` : 'A câmera e o campo de leitura continuam disponíveis.'}</p>
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
