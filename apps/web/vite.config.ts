import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { PUBLIC_ENV_PREFIX, assertNoSecretPublicEnv } from '@quack/config';

export default defineConfig(({ mode }) => {
  assertNoSecretPublicEnv({ ...process.env, ...loadEnv(mode, process.cwd(), PUBLIC_ENV_PREFIX) });
  return {
    envPrefix: PUBLIC_ENV_PREFIX,
    plugins: [react(), tailwindcss()],
    build: { outDir: 'dist', sourcemap: false },
    server: {
      // In development the UI is served by Vite and the API by the Node
      // server, so /api is proxied to it. In production the Node server
      // serves the built app itself and no proxy is involved.
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:4317',
          changeOrigin: false,
        },
      },
    },
  };
});
