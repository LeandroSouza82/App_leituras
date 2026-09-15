/// <reference types="@capacitor/local-notifications" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fastleituras.app',
  appName: 'Fast Leituras',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    GoogleAuth: {
      // Client ID Web do Google Cloud Console (usado como serverClientId no Android)
      scopes: ['profile', 'email'],
      serverClientId: '754351603454-6rppvn63citj0rqtobico7tbhp868o1r.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    LocalNotifications: {
      // Ícone monocromático próprio do Fast Leituras para a barra/status das notificações Android.
      smallIcon: 'ic_notification_fast_leituras',
      iconColor: '#0284C7',
    }
  }
};

export default config;
