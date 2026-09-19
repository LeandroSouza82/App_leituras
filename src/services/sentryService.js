import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';

const SENTRY_DSN_PADRAO = 'https://65efdec29df74e0d9bb3ca9061f86126@o4512017114202112.ingest.us.sentry.io/4512108617138176';

let sentryInicializado = false;

export const inicializarSentry = () => {
  const dsn = String(import.meta.env.VITE_SENTRY_DSN || SENTRY_DSN_PADRAO).trim();

  if (!dsn || sentryInicializado) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    sendDefaultPii: false,
  }, SentryReact.init);

  sentryInicializado = true;
  return true;
};

export const capturarErroSentry = (error, errorInfo) => {
  if (!sentryInicializado) {
    return;
  }

  Sentry.withScope((scope) => {
    if (errorInfo?.componentStack) {
      scope.setContext('react', {
        componentStack: errorInfo.componentStack,
      });
    }

    Sentry.captureException(error);
  });
};
