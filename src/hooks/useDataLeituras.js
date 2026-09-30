import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export const useDataLeituras = () => {
  const [data, setData] = useState(() => new Date());

  useEffect(() => {
    let ativo = true;
    let timer;
    const atualizar = () => {
      if (!ativo) return;
      const agora = new Date();
      setData((anterior) => anterior.toDateString() === agora.toDateString() ? anterior : agora);
      window.clearTimeout(timer);
      const proximoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
      timer = window.setTimeout(atualizar, proximoDia.getTime() - agora.getTime());
    };
    const aoMostrar = () => {
      if (document.visibilityState === 'visible') atualizar();
    };
    atualizar();
    document.addEventListener('visibilitychange', aoMostrar);
    const listener = Capacitor.isNativePlatform()
      ? App.addListener('appStateChange', ({ isActive }) => { if (isActive) atualizar(); })
        .catch((error) => { console.warn('[Leituras] Falha ao observar retorno ao app:', error); return null; })
      : null;

    return () => {
      ativo = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoMostrar);
      listener?.then((handle) => handle?.remove());
    };
  }, []);

  return data;
};
