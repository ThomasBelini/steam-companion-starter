import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tauriConfig from './src-tauri/tauri.conf.json';

export default defineConfig({
  plugins: [react()],
  // A URL esperada pelo Tauri deve permanecer fixa e restrita ao loopback.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    headers: { 'Content-Security-Policy': tauriConfig.app.security.devCsp },
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
