import { useEffect, useMemo, useRef } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NotificationService } from '../services/notificationService';
import { dataCivilNotificacao } from '../utils/horariosNotificacao';

export const useLembretesLeituras = (leituras) => {
  const atuais = useRef(leituras);
  const recebeuLeituras = useRef(false);
  const ultimoDia = useRef(null);
  atuais.current = leituras;
  if (leituras.length) recebeuLeituras.current = true;
  const assinatura = useMemo(() => JSON.stringify(
    leituras.map(({ id, completo, diaLeitura, nome }) => [id, completo, diaLeitura, nome])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  ), [leituras]);

  useEffect(() => {
    if (!recebeuLeituras.current) return;
    NotificationService.scheduleReadings(atuais.current).then((sucesso) => {
      if (sucesso) ultimoDia.current = dataCivilNotificacao(new Date());
    });
  }, [assinatura]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let ativo = true;
    const renovar = async () => {
      if (!ativo || !recebeuLeituras.current) return;
      const sucesso = await NotificationService.scheduleReadings(atuais.current);
      if (ativo && sucesso) ultimoDia.current = dataCivilNotificacao(new Date());
    };
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) renovar();
    }).catch((error) => {
      console.warn('[Lembretes] Falha ao observar retorno ao aplicativo:', error);
      return null;
    });
    // Também renova se o aplicativo permanecer aberto durante a virada do dia.
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible' && ultimoDia.current !== dataCivilNotificacao(new Date())) renovar();
    }, 60000);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      listener.then((handle) => handle?.remove()).catch((error) => {
        console.warn('[Lembretes] Falha ao remover observador do aplicativo:', error);
      });
    };
  }, []);
};
