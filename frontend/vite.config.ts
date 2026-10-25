import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: process.env.VITE_BFF_URL || 'http://localhost:4000',
        changeOrigin: true,
        // Added server-side, so the browser never sees the token (S-2).
        headers: process.env.PLAYGROUND_TOKEN ? { 'x-playground-token': process.env.PLAYGROUND_TOKEN } : {}
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Let src/test/design.test.ts read the design tokens from index.css.
    css: { include: [/index\.css/] },
    restoreMocks: true
  }
});
