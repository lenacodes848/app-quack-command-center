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
      // apps/web is .tsx and has no test infrastructure yet (no jsdom, no React
      // testing library). TASK_015 builds the real shell and brings its own
      // tests; adding them here would be scope creep. Named explicitly rather
      // than left to a .ts glob that excludes .tsx by accident.
      include: ['packages/*/src/**/*.ts', 'apps/server/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/dist/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
