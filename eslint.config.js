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
