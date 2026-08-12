import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
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

