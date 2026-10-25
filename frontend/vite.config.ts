import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Read the repo-root .env too (shared with the BFF and docker compose).
  const env = { ...loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), ''), ...process.env };
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: '0.0.0.0',
      watch: {
        usePolling: true
      },
      proxy: {
        '/api': {
          target: env.VITE_BFF_URL || 'http://localhost:4000',
          changeOrigin: true,
          // Added server-side, so the browser never sees the token (S-2).
          headers: env.PLAYGROUND_TOKEN ? { 'x-playground-token': env.PLAYGROUND_TOKEN } : {}
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
  };
});
