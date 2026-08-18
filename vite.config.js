import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { qrcode } from 'vite-plugin-qrcode';

export default defineConfig({
  plugins: [react(), basicSsl(), qrcode()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    cors: true,
    allowedHosts: 'all',
    hmr: {
      overlay: false,
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  pwa: {
    registerType: 'prompt',
    injectRegister: 'auto',
    workbox: {
      skipWaiting: false,
      clientsClaim: false,
    },
  },
});
