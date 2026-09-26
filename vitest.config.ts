import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const alias = {
  '@quack/contracts': src('./packages/contracts/src/index.ts'),
  '@quack/config': src('./packages/config/src/index.ts'),
  '@quack/adapter': src('./packages/adapter/src/index.ts'),
  '@quack/storage': src('./packages/storage/src/index.ts'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: [
            'packages/*/src/**/*.test.ts',
            'apps/*/src/**/*.test.ts',
            'tests/{contracts,security}/**/*.test.ts',
          ],
          testTimeout: 5_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // apps/web's .ts modules are tested and measured: `api.ts` is the streaming
      // client, and whether a turn's last message reaches the screen is decided
      // there, so it belongs under the thresholds. Its .tsx components are not
      // measured — no jsdom and no React testing library yet, so `App.tsx` and
      // `PairingScreen.tsx` are deliberately absent rather than dragging the
      // floor down. Named explicitly rather than left to a .ts glob that excludes
      // .tsx by accident.
      include: ['packages/*/src/**/*.ts', 'apps/server/src/**/*.ts', 'apps/web/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/dist/**', 'apps/server/src/testkit.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
