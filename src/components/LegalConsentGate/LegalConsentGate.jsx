import React, { useState } from 'react';
import { Browser } from '@capacitor/browser';
import { ExternalLink, LogOut, ShieldCheck } from 'lucide-react';
import { PRIVACY_POLICY_URL } from '../../config/publicUrls';
import {
  LEGAL_TERMS_VERSION,
  registerLegalTermsAcceptance,
} from '../../services/legalConsentService';
import './LegalConsentGate.css';

const abrirPaginaExterna = async (url) => {
  try {
    await Browser.open({ url });
  } catch {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
};

const LegalConsentGate = ({ session, onAccepted, onReject }) => {
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canContinue = termsChecked && privacyChecked && !isSaving;

  const handleAccept = async () => {
    if (!canContinue) return;

    setIsSaving(true);
    setErrorMessage('');

    try {
      await registerLegalTermsAcceptance(session);
      onAccepted();
    } catch (error) {
      console.error('[LegalConsentGate] Falha ao registrar aceite:', error);
      setErrorMessage('Não foi possível registrar seu aceite. Verifique a conexão e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="legal-consent-page">
      <section className="legal-consent-card" aria-labelledby="legal-consent-title">
        <div className="legal-consent-header">
          <div className="legal-consent-icon" aria-hidden="true">
            <ShieldCheck size={28} />
          </div>
          <p className="legal-consent-eyebrow">Primeiro acesso</p>
          <h1 id="legal-consent-title">Antes de continuar</h1>
          <p className="legal-consent-subtitle">
            Leia os documentos oficiais e confirme que está de acordo com as regras de uso do Fast Leituras.
          </p>
        </div>

        <div className="legal-consent-content">
          <div className="legal-consent-notice">
            O aplicativo registra condomínios, unidades, leituras e, quando você utiliza a câmera,
            fotografias dos medidores. O uso desses dados está explicado na política oficial.
          </div>

          <div className="legal-consent-options">
            <label className="legal-consent-option" htmlFor="legal-terms-checkbox">
              <input
                id="legal-terms-checkbox"
                type="checkbox"
                checked={termsChecked}
                onChange={(event) => setTermsChecked(event.target.checked)}
              />
              <span>
                Li e concordo com os{' '}
                <button
                  type="button"
                  className="legal-consent-link"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    abrirPaginaExterna(PRIVACY_POLICY_URL);
                  }}
                >
                  Termos de Uso
                </button>
                .
              </span>
            </label>

            <label className="legal-consent-option" htmlFor="legal-privacy-checkbox">
              <input
                id="legal-privacy-checkbox"
                type="checkbox"
                checked={privacyChecked}
                onChange={(event) => setPrivacyChecked(event.target.checked)}
              />
              <span>
                Li e estou ciente da{' '}
                <button
                  type="button"
                  className="legal-consent-link"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    abrirPaginaExterna(PRIVACY_POLICY_URL);
                  }}
                >
                  Política de Privacidade
                </button>
                .
              </span>
            </label>
          </div>

          {errorMessage && (
            <p className="legal-consent-error" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <footer className="legal-consent-footer">
          <p className="legal-consent-version">
            Versão dos documentos: {LEGAL_TERMS_VERSION}
          </p>
          <button
            type="button"
            className="legal-consent-submit"
            onClick={handleAccept}
            disabled={!canContinue}
          >
            {isSaving ? 'Registrando aceite...' : 'Aceitar e continuar'}
          </button>
          <button type="button" className="legal-consent-exit" onClick={onReject} disabled={isSaving}>
            <LogOut size={16} />
            Sair
          </button>
          <button
            type="button"
            className="legal-consent-web-link"
            onClick={() => abrirPaginaExterna(PRIVACY_POLICY_URL)}
          >
            <ExternalLink size={15} />
            Abrir política completa
          </button>
        </footer>
      </section>
    </main>
  );
};

export default LegalConsentGate;
