import { customAlert } from '../../components/CustomPrompt/CustomPrompt';
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, RotateCcw } from 'lucide-react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { parseLeituraNumerica, formatarLeitura4Casas, formatarDigitosLeitura, calcularPosicaoCursor, aplicarMascaraLeitura } from '../../utils/leituraNumerica';
import { isOcrAtivo } from '../../utils/ocrConfig';
import { executarOcr } from '../../utils/ocrService';
import './PreviewFotoModal.css';

/**
 * PreviewFotoModal
 *
 * Props novas (OCR):
 *   - imageParaOcr: string|null — imagem ANTES do carimbo (base64 DataUrl),
 *     usada exclusivamente para o reconhecimento. Nunca exibida.
 *   - ocrContexto: { condominioId, unidadeId, servico, captureId } — contexto
 *     de isolamento para descartar resultado atrasado.
 */
const PreviewFotoModal = ({
  isOpen,
  onClose,
  imageUri,
  unitInfo,
  onRetake,
  onSaveReading,
  initialValue = '',
  leituraAnterior = null,
  // Props OCR
  imageParaOcr = null,
  ocrContexto = null,
}) => {
  const [leituraValor, setLeituraValor] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [erroValidacao, setErroValidacao] = useState('');

  // Estado OCR — não altera o campo se o usuário já tocou
  const [ocrStatus, setOcrStatus] = useState('idle'); // 'idle' | 'processando' | 'concluido' | 'erro'
  const [ocrAviso, setOcrAviso] = useState('');

  // Proteção: guarda o captureId do contexto atual para descartar resultados atrasados
  const contextoAtualRef = useRef(null);
  // Flag: true se o usuário já editou/colou/apagou o campo — descarta OCR
  const usuarioEditouRef = useRef(false);

  const inputRef = useRef(null);

  const validarLeitura = (valor) => {
    if (leituraAnterior !== null && leituraAnterior !== undefined) {
      const valorAtualFloat = parseLeituraNumerica(valor);
      const valorAnteriorFloat = parseLeituraNumerica(leituraAnterior);
      if (
        valorAtualFloat !== null &&
        valorAnteriorFloat !== null &&
        Math.round(valorAtualFloat * 10000) < Math.round(valorAnteriorFloat * 10000)
      ) {
        setErroValidacao('A leitura não pode ser menor que o mês anterior');
      } else {
        setErroValidacao('');
      }
    } else {
      setErroValidacao('');
    }
  };

  const handleInputChange = (e) => {
    // Qualquer edição cancela o OCR pendente
    usuarioEditouRef.current = true;
    setOcrStatus('idle');
    setOcrAviso('');

    const raw = e.target.value;
    if (!raw) {
      setLeituraValor('');
      setErroValidacao('');
      return;
    }

    const input = e.target;
    const cursor = input.selectionStart || 0;
    const textBeforeCursor = raw.slice(0, cursor);
    const digitsBeforeCursor = textBeforeCursor.replace(/\D/g, '').length;
    const totalDigits = raw.replace(/\D/g, '').length;

    // Se o usuário colou ou inseriu valor com separadores em campo vazio/novo
    let formatted = '';
    if (!leituraValor && (raw.includes('.') || raw.includes(','))) {
      formatted = aplicarMascaraLeitura(raw);
    } else {
      formatted = formatarDigitosLeitura(raw);
    }

    setLeituraValor(formatted);
    validarLeitura(formatted);

    const newPos = calcularPosicaoCursor(formatted, digitsBeforeCursor, totalDigits);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    });
  };

  const handleKeyDown = (e) => {
    // Qualquer tecla no campo (incluindo Backspace) cancela OCR pendente
    if (!usuarioEditouRef.current) {
      usuarioEditouRef.current = true;
      setOcrStatus('idle');
      setOcrAviso('');
    }

    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const { selectionStart, selectionEnd, value } = input;
      if (selectionStart === selectionEnd && selectionStart > 0) {
        const charBefore = value[selectionStart - 1];
        if (charBefore === ',' || charBefore === '.') {
          e.preventDefault();
          const posToDelete = selectionStart - 2;
          if (posToDelete >= 0) {
            const newValue = value.slice(0, posToDelete) + value.slice(selectionStart - 1);
            const digitsBefore = value.slice(0, posToDelete).replace(/\D/g, '').length;
            const totalDigits = newValue.replace(/\D/g, '').length;
            const formatted = formatarDigitosLeitura(newValue);
            const newPos = calcularPosicaoCursor(formatted, digitsBefore, totalDigits);
            setLeituraValor(formatted);
            validarLeitura(formatted);
            requestAnimationFrame(() => {
              if (inputRef.current) {
                inputRef.current.setSelectionRange(newPos, newPos);
              }
            });
          }
        }
      }
    }
  };

  const handlePaste = (e) => {
    // Cola = edição manual — cancela OCR
    usuarioEditouRef.current = true;
    setOcrStatus('idle');
    setOcrAviso('');

    e.preventDefault();
    const pasted = e.clipboardData?.getData('text') || '';
    const trimmed = pasted.trim();
    if (!trimmed) return;

    const formatted = aplicarMascaraLeitura(trimmed);
    if (formatted) {
      setLeituraValor(formatted);
      validarLeitura(formatted);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(formatted.length, formatted.length);
        }
      });
    }
  };

  // Garante limpeza e estado pronto para digitação sempre que o modal abrir
  useEffect(() => {
    if (isOpen) {
      // Reseta proteções para a nova foto/abertura
      usuarioEditouRef.current = false;
      contextoAtualRef.current = ocrContexto?.captureId ?? null;
      setOcrStatus('idle');
      setOcrAviso('');

      const formattedInitial = initialValue ? aplicarMascaraLeitura(initialValue) : '';
      setLeituraValor(formattedInitial);
      if (formattedInitial) {
        validarLeitura(formattedInitial);
        // Leitura já existente: não sobrescrever com OCR
        usuarioEditouRef.current = true;
      } else {
        setErroValidacao('');
      }
    }
  }, [isOpen, initialValue, leituraAnterior]);

  // Dispara OCR quando o modal abre com imagem disponível
  useEffect(() => {
    if (!isOpen) return;
    if (!imageParaOcr) return;
    if (!isOcrAtivo()) return;
    if (!ocrContexto) return;

    // Guarda o captureId desta execução para checagem posterior
    const captureIdDesta = ocrContexto.captureId;
    contextoAtualRef.current = captureIdDesta;

    let cancelado = false;

    const rodar = async () => {
      // Se o usuário já tem valor ou já editou, não preenche
      if (usuarioEditouRef.current) return;

      setOcrStatus('processando');
      setOcrAviso('');

      const resultado = await executarOcr(imageParaOcr, ocrContexto);

      if (cancelado) return; // modal fechou ou foto foi refeita

      // Descarta se o contexto mudou (unidade/serviço diferente, nova foto)
      if (contextoAtualRef.current !== captureIdDesta) return;

      // Descarta se o usuário editou enquanto processava
      if (usuarioEditouRef.current) {
        setOcrStatus('idle');
        return;
      }

      // Descarta se já há leitura no campo
      if (leituraValor) {
        setOcrStatus('idle');
        return;
      }

      if (!resultado.sucesso) {
        setOcrStatus('erro');
        setOcrAviso('Reconhecimento indisponível. Digite a leitura manualmente.');
        return;
      }

      if (resultado.valor === null || resultado.confianca === 'baixa' || resultado.confianca === null) {
        setOcrStatus('erro');
        setOcrAviso('Não foi possível reconhecer a leitura com segurança. Verifique o medidor e digite manualmente.');
        return;
      }

      // Aplica a formatação existente ao valor reconhecido
      const valorFormatado = aplicarMascaraLeitura(resultado.valor);
      if (!valorFormatado) {
        setOcrStatus('erro');
        setOcrAviso('Valor reconhecido é inválido. Digite manualmente.');
        return;
      }

      // Preenche o campo uma única vez
      setLeituraValor(valorFormatado);
      validarLeitura(valorFormatado);
      setOcrStatus('concluido');
      setOcrAviso('');
    };

    rodar();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, imageParaOcr, ocrContexto?.captureId]);

  if (!isOpen || !imageUri) return null;

  const handleSave = async () => {
    if (!leituraValor || isSaving) return;

    setIsSaving(true);
    try {
      await onSaveReading(leituraValor);
      setLeituraValor('');
      setOcrStatus('idle');
      setOcrAviso('');
      onClose();
    } catch (error) {
      await customAlert('Erro ao sincronizar leitura: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="preview-foto-overlay" onClick={onClose}>
      <div className="preview-foto-container" onClick={(e) => e.stopPropagation()}>
        <header className="preview-foto-header">
          <h3>{unitInfo}</h3>
          <button type="button" className="btn-close" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="preview-foto-body">
          {/* Imagem com botões flutuantes sobrepostos */}
          <div className="preview-img-wrapper">
            <Zoom>
              <img src={imageUri} alt="Preview do Medidor" className="preview-full-img" />
            </Zoom>

            {/* Botão flutuante — apenas Alterar. Exclusão via long press no mini card */}
            <div className="preview-floating-actions" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-floating btn-floating-retake"
                onClick={onRetake}
                disabled={isSaving}
                title="Refazer foto"
              >
                <RotateCcw size={16} />
                <span>Alterar</span>
              </button>
            </div>
          </div>

          <div className="reading-input-container">
            <label htmlFor="leitura-atual" style={{ textTransform: 'uppercase' }}>LANÇAR LEITURA ATUAL</label>
            
            <div className="bg-slate-50 p-2 rounded-md mb-2 border border-slate-200" style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', marginBottom: '8px' }}>
              <p className="text-sm text-gray-600 font-medium" style={{ fontSize: '13px', color: '#475569' }}>
                Leitura Anterior: <strong>{leituraAnterior !== null && leituraAnterior !== undefined ? formatarLeitura4Casas(leituraAnterior) : '0,0000'}</strong>
              </p>
              {leituraValor && (() => {
                const atualFloat = parseLeituraNumerica(leituraValor);
                const anteriorFloat = parseLeituraNumerica(leituraAnterior !== null && leituraAnterior !== undefined ? leituraAnterior : 0);
                if (atualFloat !== null && anteriorFloat !== null && atualFloat >= anteriorFloat) {
                  const consumo = atualFloat - anteriorFloat;
                  return (
                    <p className="text-sm font-semibold text-blue-600 mt-1" style={{ fontSize: '13px', color: '#2563eb', marginTop: '4px' }}>
                      Consumo Calculado: <strong>{formatarLeitura4Casas(consumo)} m³</strong>
                    </p>
                  );
                }
                return null;
              })()}
            </div>

            {/* Indicador de status OCR — discreto, nunca bloqueia o campo */}
            {isOcrAtivo() && ocrStatus === 'processando' && (
              <div
                className="ocr-status-indicator ocr-status-processando"
                role="status"
                aria-live="polite"
              >
                <span className="ocr-spinner" />
                <span>Reconhecendo leitura…</span>
              </div>
            )}
            {isOcrAtivo() && ocrStatus === 'concluido' && (
              <div
                className="ocr-status-indicator ocr-status-concluido"
                role="status"
                aria-live="polite"
              >
                <span>✓ Sugestão do OCR · Confira o medidor antes de salvar</span>
              </div>
            )}
            {isOcrAtivo() && ocrStatus === 'erro' && ocrAviso && (
              <div
                className="ocr-status-indicator ocr-status-erro"
                role="alert"
              >
                <span>{ocrAviso}</span>
              </div>
            )}

            <input
              ref={inputRef}
              id="leitura-atual"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={leituraValor}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Digite a leitura..."
              className={`reading-input-field ${erroValidacao ? 'border-red-500' : ''}`}
              style={erroValidacao ? { borderColor: '#ef4444' } : {}}
              autoComplete="off"
            />
            {erroValidacao && (
              <span className="text-xs text-red-500 mt-1" style={{ fontSize: '12px', color: '#ef4444', display: 'block', marginTop: '4px' }}>
                {erroValidacao}
              </span>
            )}
          </div>
        </div>

        <footer className="preview-foto-footer">
          <button
            type="button"
            className={`btn-concluir-leitura ${erroValidacao ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleSave}
            disabled={!leituraValor || isSaving || !!erroValidacao}
            style={erroValidacao ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            <Save size={20} />
            {isSaving ? 'Salvando...' : 'Salvar / Concluir Leitura'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PreviewFotoModal;
