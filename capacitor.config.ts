import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fastleituras.app',
  appName: 'Fast Leituras',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'http',
    allowNavigation: ['*']
  },
  plugins: {
    GoogleAuth: {
      // Client ID Web do Google Cloud Console (usado como serverClientId no Android)
      scopes: ['profile', 'email'],
      serverClientId: '754351603454-6rppvn63citj0rqtobico7tbhp868o1r.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    }
  }
};

export default config;
