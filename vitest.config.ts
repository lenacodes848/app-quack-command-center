import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@quack/contracts': src('./packages/contracts/src/index.ts'),
      '@quack/config': src('./packages/config/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'tests/{contracts,integration,security}/**/*.test.ts',
    ],
    testTimeout: 30_000,
  },
});
