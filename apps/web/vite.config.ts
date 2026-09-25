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
  };
});
