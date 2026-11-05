import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local development: Vite proxies the browser to the server-only Gemini gateway.
// Never inject GEMINI_API_KEY into import.meta.env or the JavaScript bundle.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' }
  }
});
