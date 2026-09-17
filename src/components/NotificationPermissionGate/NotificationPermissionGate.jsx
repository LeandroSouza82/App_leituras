import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CalendarClock, AlertCircle, AlertTriangle, Settings, RefreshCw, LogOut } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { NotificationService } from '../../services/notificationService';
import './NotificationPermissionGate.css';

const NotificationPermissionGate = ({
  permissionStatus,
  onPermissionUpdated,
  onPermissionGranted,
  onLogout,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [tentouSolicitar, setTentouSolicitar] = useState(false);

  const statusAtual = permissionStatus?.status || 'prompt';
  const canRequest = permissionStatus?.canRequest ?? true;
  const notificationGranted = permissionStatus?.notificationGranted ?? statusAtual === 'granted';
  const precisaAlarmeExato = notificationGranted && permissionStatus?.exactAlarmGranted === false;
  const isDeniedPermanent = !precisaAlarmeExato && (statusAtual === 'denied' || (!canRequest && tentouSolicitar));

  const verificarNovamente = useCallback(async () => {
    setIsProcessing(true);
    try {
      const res = await NotificationService.checkPermissionStatus();
      onPermissionUpdated?.(res);
      if (res.granted) {
        onPermissionGranted?.();
      }
      return res;
    } finally {
      setIsProcessing(false);
    }
  }, [onPermissionUpdated, onPermissionGranted]);

  const handleSolicitarPermissao = async () => {
    setIsProcessing(true);
    setTentouSolicitar(true);
    try {
      await NotificationService.requestPermissions();
      await verificarNovamente();
    } catch (error) {
      console.warn('[NotificationPermissionGate] Erro ao solicitar permissão:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAtivarAlarmesExatos = async () => {
    setIsProcessing(true);
    try {
      await NotificationService.openExactAlarmSettings();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAbrirConfiguracoes = async () => {
    setIsProcessing(true);
    try {
      await NotificationService.openAppSettings();
    } finally {
      setIsProcessing(false);
    }
  };

  // Revalida automaticamente quando o usuário retorna das configurações do sistema
  useEffect(() => {
    let ativo = true;

    const listenerPromise = CapacitorApp.addListener('appStateChange', async (state) => {
      if (ativo && state.isActive) {
        await verificarNovamente();
      }
    });

    return () => {
      ativo = false;
      listenerPromise.then((handle) => handle?.remove?.());
    };
  }, [verificarNovamente]);

  return (
    <main className="notification-gate-page">
      <section className="notification-gate-card" aria-labelledby="notification-gate-title">
        <header className="notification-gate-header">
          <div
            className={`notification-gate-icon-wrapper ${isDeniedPermanent ? 'notification-gate-icon-wrapper--warning' : ''}`}
            aria-hidden="true"
          >
            {isDeniedPermanent ? <AlertTriangle size={28} /> : <Bell size={28} />}
          </div>
          <p className="notification-gate-eyebrow">Configuração importante</p>
          <h1 id="notification-gate-title">Ativação de Notificações</h1>
          <p className="notification-gate-subtitle">
            O Fast Leituras precisa enviar lembretes para garantir que nenhum condomínio fique com a medição atrasada.
          </p>
        </header>

        <div className="notification-gate-content">
          <div className="notification-gate-notice">
            Para sua comodidade, o aplicativo monitora o cronograma e avisa você automaticamente:
          </div>

          <div className="notification-gate-reminders-list">
            <div className="notification-gate-reminder-item">
              <div className="notification-gate-reminder-badge notification-gate-reminder-badge--amber" aria-hidden="true">
                <CalendarClock size={20} />
              </div>
              <div className="notification-gate-reminder-text">
                <p className="notification-gate-reminder-title">⏰ 1 dia antes da leitura</p>
                <p className="notification-gate-reminder-desc">Lembretes às 09:00 e às 14:00 para você planejar a sua rota de medição.</p>
              </div>
            </div>

            <div className="notification-gate-reminder-item">
              <div className="notification-gate-reminder-badge notification-gate-reminder-badge--red" aria-hidden="true">
                <Bell size={20} />
              </div>
              <div className="notification-gate-reminder-text">
                <p className="notification-gate-reminder-title">🚨 No próprio dia da leitura</p>
                <p className="notification-gate-reminder-desc">Lembretes prioritários às 09:00 e às 14:00 informando os condomínios do dia.</p>
              </div>
            </div>

            <div className="notification-gate-reminder-item">
              <div className="notification-gate-reminder-badge notification-gate-reminder-badge--orange" aria-hidden="true">
                <AlertCircle size={20} />
              </div>
              <div className="notification-gate-reminder-text">
                <p className="notification-gate-reminder-title">⚠️ Quando a leitura estiver atrasada</p>
                <p className="notification-gate-reminder-desc">Aviso imediato para regularizar pendências que ultrapassaram a data.</p>
              </div>
            </div>
          </div>

          {precisaAlarmeExato && (
            <>
              <div className="notification-gate-alert-box" role="alert">
                O Android ainda não autorizou os alarmes exatos. Sem essa autorização, os lembretes podem chegar atrasados quando o aplicativo estiver fechado.
              </div>

              <div className="notification-gate-instructions">
                <strong>Como garantir os horários de 09:00 e 14:00:</strong>
                <ol>
                  <li>Toque em <strong>Ativar alarmes exatos</strong> abaixo;</li>
                  <li>Ative a opção para o <strong>Fast Leituras</strong>;</li>
                  <li>Retorne ao aplicativo.</li>
                </ol>
              </div>
            </>
          )}

          {isDeniedPermanent && (
            <>
              <div className="notification-gate-alert-box" role="alert">
                As notificações estão desativadas para o aplicativo no seu aparelho. Como a permissão foi negada anteriormente, o Android exige que você a ative nas Configurações.
              </div>

              <div className="notification-gate-instructions">
                <strong>Como ativar nas configurações do Android:</strong>
                <ol>
                  <li>Toque no botão <strong>Abrir configurações</strong> abaixo;</li>
                  <li>Localize a seção <strong>Notificações</strong>;</li>
                  <li>Ative a opção <strong>Permitir notificações</strong>;</li>
                  <li>Retorne ao aplicativo.</li>
                </ol>
              </div>
            </>
          )}

          {!isDeniedPermanent && tentouSolicitar && (
            <div className="notification-gate-alert-box" role="alert">
              A permissão não foi concedida. As notificações são essenciais para que o aplicativo possa lembrar você das datas de leitura.
            </div>
          )}
        </div>

        <footer className="notification-gate-footer">
          {precisaAlarmeExato ? (
            <>
              <button
                type="button"
                className="notification-gate-btn-primary"
                onClick={handleAtivarAlarmesExatos}
                disabled={isProcessing}
              >
                <Settings size={18} />
                Ativar alarmes exatos
              </button>

              <button
                type="button"
                className="notification-gate-btn-secondary"
                onClick={verificarNovamente}
                disabled={isProcessing}
              >
                <RefreshCw size={17} className={isProcessing ? 'animate-spin' : ''} />
                Já ativei / Verificar permissão
              </button>
            </>
          ) : isDeniedPermanent ? (
            <>
              <button
                type="button"
                className="notification-gate-btn-primary"
                onClick={handleAbrirConfiguracoes}
                disabled={isProcessing}
              >
                <Settings size={18} />
                Abrir configurações
              </button>

              <button
                type="button"
                className="notification-gate-btn-secondary"
                onClick={verificarNovamente}
                disabled={isProcessing}
              >
                <RefreshCw size={17} className={isProcessing ? 'animate-spin' : ''} />
                Já ativei / Verificar permissão
              </button>
            </>
          ) : (
            <button
              type="button"
              className="notification-gate-btn-primary"
              onClick={handleSolicitarPermissao}
              disabled={isProcessing}
            >
              <Bell size={18} />
              {tentouSolicitar ? 'Tentar novamente' : 'Ativar notificações'}
            </button>
          )}

          <button
            type="button"
            className="notification-gate-btn-exit"
            onClick={onLogout}
            disabled={isProcessing}
          >
            <LogOut size={15} />
            Sair
          </button>
        </footer>
      </section>
    </main>
  );
};

export default NotificationPermissionGate;
