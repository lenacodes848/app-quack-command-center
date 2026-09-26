import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Root-level tool configs that are not part of tsconfig.eslint.json's project graph
// (they configure a tool rather than being application/test source). They still get
// full ordinary linting; only the type-aware rules, which need a project reference
// these files don't have, are turned off for them below.
const ROOT_TOOL_CONFIGS = [
  'eslint.config.js',
  'vitest.config.ts',
  'apps/web/vite.config.ts',
  'playwright.config.ts',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'node_modules/**',
      '**/*.mjs',
      'tests/integration/fixtures/**',
      // Playwright's own output. These are git-ignored, but ESLint does not read
      // .gitignore, so without them a single failing browser test leaves behind
      // bundled trace JavaScript that lint then tries to type-check and dies on
      // — turning one test failure into a lint failure that persists across runs
      // until the directory is deleted by hand.
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ROOT_TOOL_CONFIGS,
    languageOptions: {
      parserOptions: { project: ['./tsconfig.eslint.json'], tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ROOT_TOOL_CONFIGS,
    ...tseslint.configs.disableTypeChecked,
  },
);
