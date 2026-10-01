import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isOcrAtivo, observarOcr } from '../utils/ocrConfig.js';
import { executarOcr } from '../utils/ocrService.js';

export const LIMITE_OCR_MS = 5000;

// O contexto deve representar a unidade/serviço exibidos, além da captura.
export const chaveContextoOcr = (contexto) => contexto ? JSON.stringify([
  contexto.condominioId, contexto.unidadeId, contexto.servico, contexto.captureId,
]) : '';

export const useOcrLeitura = ({ isOpen, image, contexto, initialValue, onResult, reconhecer = executarOcr }) => {
  const ativo = useSyncExternalStore(observarOcr, isOcrAtivo, () => false);
  const chave = chaveContextoOcr(contexto);
  const sessao = useRef(null);
  const callback = useRef(onResult);
  const [status, setStatus] = useState('idle');
  const [diagnostico, setDiagnostico] = useState([]);

  useLayoutEffect(() => { callback.current = onResult; });
  useLayoutEffect(() => {
    const atual = { cancelado: Boolean(initialValue), chave };
    sessao.current = atual;
    setStatus('idle');
    setDiagnostico([]);
    return () => { atual.cancelado = true; };
  }, [isOpen, image, chave, initialValue]);

  const cancelar = () => {
    if (sessao.current) sessao.current.cancelado = true;
    setStatus('idle');
  };

  useEffect(() => {
    const atual = sessao.current;
    if (!ativo || !isOpen || !image || !chave || atual.cancelado) return;
    let cancelado = false;
    let timer;
    const valido = () => !cancelado && !atual.cancelado && sessao.current === atual && isOcrAtivo();
    // A primeira montagem descartada pelo StrictMode não chama o motor.
    Promise.resolve().then(async () => {
      if (!valido()) return;
      setStatus('processando');
      const inicio = Date.now();
      const registrar = (etapa) => {
        if (!valido()) return;
        setDiagnostico(anterior => [...anterior, `${Date.now() - inicio} ms · ${etapa}`].slice(-12));
      };
      registrar('Início');
      timer = setTimeout(() => {
        if (!valido()) return;
        registrar('Limite de espera atingido');
        atual.cancelado = true;
        setStatus('demorado');
      }, LIMITE_OCR_MS);
      try {
        const resultado = await reconhecer(image, contexto, registrar, valido);
        if (!valido()) return;
        if (!resultado.sucesso || !resultado.valor) {
          setStatus('erro');
          return;
        }
        atual.cancelado = true; // Uma sugestão por sessão; nunca salva.
        callback.current(resultado.valor);
        setStatus('concluido');
      } catch {
        if (valido()) { registrar('Falha inesperada'); setStatus('erro'); }
      } finally {
        clearTimeout(timer);
      }
    });
    return () => { cancelado = true; clearTimeout(timer); };
  }, [ativo, isOpen, image, chave, initialValue, reconhecer]);

  return { ativo, status, cancelar, diagnostico };
};
