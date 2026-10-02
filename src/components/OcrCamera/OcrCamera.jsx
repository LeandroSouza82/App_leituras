import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Flashlight, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { criarSessaoCameraOcr } from '../../services/ocrCameraService';
import { obterAreaCameraOcr, prepararCapturaEnquadrada } from '../../utils/ocrEnquadramento';
import './OcrCamera.css';

const detalheDoTeste = (etapa, erro) => import.meta.env.VITE_OCR_DIAGNOSTICO === 'true'
  ? `${etapa}: ${String(erro?.message || 'Falha sem detalhe informado.').slice(0, 180)}` : '';

const OcrCamera = ({ unidade, onCapture, onClose, onGaleria = null }) => {
  const viewportRef = useRef(null);
  const guiaRef = useRef(null);
  const sessaoRef = useRef(null);
  const geometriaRef = useRef(null);
  const ocupadaRef = useRef(false);
  const fechandoRef = useRef(false);
  const montadaRef = useRef(false);
  const callbacksRef = useRef({ onCapture, onClose, onGaleria });
  callbacksRef.current = { onCapture, onClose, onGaleria };
  const [pronta, setPronta] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [erro, setErro] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [faixaAlta, setFaixaAlta] = useState(false);
  const [largura, setLargura] = useState(88);
  const [temLuz, setTemLuz] = useState(false);
  const [luz, setLuz] = useState(false);

  const fechar = async (galeria = false) => {
    if (fechandoRef.current || (galeria && ocupadaRef.current)) return;
    fechandoRef.current = true;
    ocupadaRef.current = true;
    setOcupada(true);
    try { await sessaoRef.current?.fechar(); }
    catch { /* A restauração da interface acontece mesmo se o stop falhar. */ }
    if (montadaRef.current) {
      if (galeria) callbacksRef.current.onGaleria?.();
      else callbacksRef.current.onClose();
    }
  };

  useEffect(() => {
    montadaRef.current = true;
    const sessao = criarSessaoCameraOcr();
    sessaoRef.current = sessao;
    let atual = true;
    let previaPronta = false;
    let listeners = [];
    setPronta(false); setTemLuz(false); setLuz(false); setErro(''); setDiagnostico('');
    const fecharEmSegundoPlano = () => { if (atual) callbacksRef.current.onClose(); };
    Promise.resolve().then(async () => {
      if (!atual) return;
      try {
        if (Capacitor.isNativePlatform()) {
          const registros = await Promise.allSettled([
            App.addListener('backButton', fecharEmSegundoPlano),
            App.addListener('appStateChange', ({ isActive }) => { if (!isActive && previaPronta) fecharEmSegundoPlano(); }),
          ]);
          listeners = registros.filter(r => r.status === 'fulfilled').map(r => r.value);
          if (!atual) { listeners.forEach(l => l.remove()); return; }
          if (registros.some(r => r.status === 'rejected')) throw new Error('Falha ao observar o estado da câmera.');
        }
        const viewport = obterAreaCameraOcr(viewportRef.current.getBoundingClientRect(), Capacitor.isNativePlatform());
        geometriaRef.current = viewport;
        if (!await sessao.abrir(viewport) || !atual) return;
        previaPronta = true;
        setPronta(true);
        const modos = await sessao.modosFlash().catch(() => []);
        if (atual) setTemLuz(modos.includes('torch'));
      } catch (falha) {
        if (atual) {
          setErro('Não foi possível abrir a câmera. Confira a permissão e tente novamente.');
          setDiagnostico(detalheDoTeste('Abertura da câmera', falha));
        }
      }
    });
    return () => {
      atual = false; montadaRef.current = false;
      listeners.forEach(l => l.remove());
      sessao.fechar().catch(() => {});
    };
  }, [tentativa]);

  const capturar = async () => {
    if (!pronta || ocupadaRef.current) return;
    ocupadaRef.current = true; setOcupada(true); setErro(''); setDiagnostico('');
    const sessao = sessaoRef.current;
    let preparada;
    let etapa = 'Área da câmera';
    try {
      const viewport = viewportRef.current.getBoundingClientRect();
      const guia = guiaRef.current.getBoundingClientRect();
      const nativa = Capacitor.isNativePlatform();
      const areaAtual = obterAreaCameraOcr(viewport, nativa);
      if (nativa && ['left', 'top', 'width', 'height'].some(k => Math.abs(areaAtual[k] - geometriaRef.current[k]) > 1)) {
        throw new Error('A área da câmera mudou. Reinicie a captura.');
      }
      // O guia é medido no toque; sua posição na janela aponta para a mesma
      // superfície nativa mesmo se o rodapé mudar de altura depois da abertura.
      const area = nativa ? geometriaRef.current : areaAtual;
      etapa = 'Captura da foto';
      let foto = await sessao.capturar();
      if (!foto || !montadaRef.current || fechandoRef.current || sessaoRef.current !== sessao) return;
      etapa = 'Preparo da imagem';
      preparada = await prepararCapturaEnquadrada(`data:image/jpeg;base64,${foto.value}`,
        area, { left: guia.left - area.left, top: guia.top - area.top, width: guia.width, height: guia.height },
        nativa ? { width: foto.previewWidth, height: foto.previewHeight } : null);
      foto = null;
      etapa = 'Encerramento da câmera';
      await sessao.fechar();
      if (!montadaRef.current || fechandoRef.current || sessaoRef.current !== sessao) return;
      etapa = 'Entrega da foto';
      callbacksRef.current.onCapture(preparada);
      preparada = null; // A partir daqui o fluxo de leitura é dono do recurso OCR.
    } catch (falha) {
      await sessao.fechar().catch(() => {});
      if (montadaRef.current && !fechandoRef.current) {
        setErro('Não foi possível capturar a foto. Tente novamente.');
        setDiagnostico(detalheDoTeste(etapa, falha));
        setPronta(false);
      }
    } finally {
      preparada?.imagemOcr.liberar();
      if (!fechandoRef.current) {
        ocupadaRef.current = false;
        if (montadaRef.current) setOcupada(false);
      }
    }
  };

  const alternarLuz = async () => {
    if (ocupadaRef.current) return;
    try { await sessaoRef.current.luz(!luz); if (montadaRef.current) setLuz(!luz); }
    catch { if (montadaRef.current) setErro('Não foi possível mudar a iluminação.'); }
  };

  return createPortal(
    <div className="ocr-camera" role="dialog" aria-modal="true" aria-label="Fotografar leitura com OCR">
      <header className="ocr-camera-header">
        <div><strong>{unidade}</strong><span>Enquadre todos os números, incluindo os decimais.</span></div>
        <button type="button" onClick={() => fechar()} aria-label="Cancelar foto"><X /></button>
      </header>
      <div className="ocr-camera-area">
        <div className="ocr-camera-preview" id="ocr-camera-preview" ref={viewportRef}>
          <div ref={guiaRef} className="ocr-camera-guia"
            style={{ width: `${largura}%`, aspectRatio: faixaAlta ? '3' : '5' }} aria-label="Área dos números para reconhecimento" />
          {!pronta && <div className="ocr-camera-status" role={erro ? 'alert' : 'status'}>{erro || 'Abrindo câmera…'}</div>}
        </div>
      </div>
      <footer className="ocr-camera-footer">
        <div className="ocr-camera-formatos" aria-label="Tamanho do visor">
          <button type="button" aria-pressed={!faixaAlta} onClick={() => setFaixaAlta(false)} disabled={ocupada}>Uma linha</button>
          <button type="button" aria-pressed={faixaAlta} onClick={() => setFaixaAlta(true)} disabled={ocupada}>Visor maior</button>
        </div>
        <label className="ocr-camera-ajuste">Largura do guia
          <input type="range" min="55" max="94" value={largura} disabled={ocupada}
            onChange={e => setLargura(Number(e.target.value))} />
        </label>
        {erro && pronta && <p role="alert">{erro}</p>}
        {diagnostico && <p className="ocr-camera-diagnostico" role="status">Detalhe do teste: {diagnostico}</p>}
        {erro && !pronta && <button type="button" onClick={() => setTentativa(t => t + 1)} disabled={ocupada}>Tentar novamente</button>}
        <div className="ocr-camera-acoes">
          {temLuz && <button type="button" onClick={alternarLuz} disabled={ocupada} aria-pressed={luz} aria-label="Iluminar medidor"><Flashlight /></button>}
          <button type="button" className="ocr-camera-capturar" onClick={capturar} disabled={!pronta || ocupada}>
            <Camera />{ocupada ? 'Preparando foto…' : 'Tirar foto'}
          </button>
          {onGaleria && <button type="button" onClick={() => fechar(true)} disabled={ocupada}>Galeria (teste)</button>}
        </div>
      </footer>
    </div>, document.body,
  );
};

export default OcrCamera;
