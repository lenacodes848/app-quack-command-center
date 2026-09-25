# TASK_002 Monorepo Scaffold and Pinned Toolchain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the empty repository into an npm-workspaces monorepo with a strict, pinned TypeScript toolchain, a validated environment schema, and separate server and web builds, with no product behavior yet.

**Architecture:** Root workspace with `apps/server`, `apps/web`, and two shared packages (`packages/config`, `packages/contracts`). Only packages that TASK_002 needs are created. The rest of the PRD 3.8 layout arrives with the task that fills each package, to avoid empty placeholders. Libraries build to `dist` with `tsc -b` project references. Vitest and Vite resolve workspace packages from source through aliases.

**Tech Stack:** Node 24.21.0, TypeScript 6.0.2, Zod 4.4.3, React 19.2.8, Vite 8.1.5, `@vitejs/plugin-react` 6.0.4, Tailwind CSS 4.3.3, Vitest 4.1.10 with `@vitest/coverage-v8` 4.1.10, ESLint 10.11.0, typescript-eslint 8.70.1, Prettier 3.9.9. These exact versions were verified together on 2026-09-24, see `research.md`.

**Spec:** `PERSONAL_AI_COMMAND_CENTER_PRD.md` TASK_002 (acceptance criteria 1 to 7, test requirements 1 to 4) and section 2.3. Decisions and the version spike: `research.md`. Overall phase plan: `docs/superpowers/plans/2026-09-24-personal-ai-command-center.md`.

## Global Constraints

- Exact dependency versions only, committed lockfile, `save-exact=true` (PRD 2.1, TASK_002 criterion 4).
- Node pinned to 24.21.0 in `.nvmrc` and `engines` (criterion 5). Run `nvm use` in every shell.
- TypeScript `strict` (criterion 2). Server and web build separately (criterion 3).
- Environment variables are typed and validated, failing with an actionable message that never prints a value (criterion 6).
- No secret in a Vite-exposed variable (criterion 7). Only `VITE_`-prefixed names reach the browser.
- The server binds to a loopback address only (PRD 2.3).
- No personal name, email address, home-directory path or private hostname anywhere, including `package.json` fields. Do not add a `repository` field with an SSH-style remote until the scanner rule is fixed (see the self-review note at the end).
- Do not approve better-sqlite3's npm install script. It is not needed (`research.md`). It is not added until TASK_005 anyway.
- Do not add a dependency before the task that uses it.
- Keep `npm run test:repo`, `npm run scan:source` and `npm run scan:secrets` working.

## File Structure

```text
package.json                     workspaces root, scripts, exact devDependencies
.npmrc                           save-exact, engine-strict
tsconfig.base.json               shared strict compiler options
tsconfig.json                    solution file with project references
eslint.config.js                 flat config, type-aware, TS and TSX only
.prettierrc.json  .prettierignore
vitest.config.ts                 include globs, workspace aliases
packages/contracts/              package.json, tsconfig.json, src/index.ts (PRODUCT_NAME)
packages/config/                 package.json, tsconfig.json
  src/index.ts                   exports
  src/env.ts                     ConfigError, loadServerEnv
  src/env.test.ts
  src/vite-env.ts                assertNoSecretPublicEnv, PUBLIC_ENV_PREFIX
  src/vite-env.test.ts
apps/server/                     package.json, tsconfig.json, src/index.ts (loads env, prints bind address)
apps/web/                        package.json, tsconfig.json, vite.config.ts, index.html
  src/main.tsx  src/App.tsx  src/styles.css
tests/integration/build.integration.test.ts
```

---

### Task 1: Workspace skeleton, toolchain config and a smoke test

**Files:**
- Modify: `package.json`
- Create: `.npmrc`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`
- Create: `packages/contracts/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}`

**Interfaces:**
- Produces: `PRODUCT_NAME: string` exported from `@quack/contracts`. Root scripts `build`, `build:server`, `build:web`, `typecheck`, `lint`, `format`, `format:check`, `test`.

- [ ] **Step 1: Write the failing smoke test (and do not create `packages/contracts/src/index.ts` yet)**

`packages/contracts/src/index.test.ts`:

```ts
import { expect, test } from 'vitest';
import { PRODUCT_NAME } from './index.js';

test('exposes the owner-approved product name', () => {
  expect(PRODUCT_NAME).toBe('Quack Command Center');
});
```

- [ ] **Step 2: Write the config files**

`.npmrc`:

```ini
save-exact=true
engine-strict=true
```

Root `package.json` (keep the existing three scripts and add the rest):

```json
{
  "name": "app-quack-command-center",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Quack Command Center: a local-first, single-owner web dashboard for coding agents.",
  "engines": { "node": ">=24.21.0 <25" },
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "npm run build:server && npm run build:web",
    "build:server": "tsc -b apps/server",
    "build:web": "npm run build --workspace @quack/web",
    "typecheck": "tsc -b && tsc -p apps/web",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:repo": "node --test \"tests/repo/*.test.mjs\"",
    "scan:source": "node scripts/source-protection-scan.mjs",
    "scan:secrets": "gitleaks dir . --no-banner --redact"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.6",
    "@vitest/coverage-v8": "4.1.10",
    "eslint": "10.11.0",
    "prettier": "3.9.9",
    "typescript": "6.0.2",
    "typescript-eslint": "8.70.1",
    "vitest": "4.1.10"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "composite": true,
    "skipLibCheck": false,
    "types": ["node"]
  }
}
```

`packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/contracts/package.json`:

```json
{
  "name": "@quack/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
}
```

Root `tsconfig.json` starts with only the package that exists. Tasks 2 and 4 add their own reference when they create their package:

```json
{
  "files": [],
  "references": [{ "path": "packages/contracts" }]
}
```

`vitest.config.ts`:

```ts
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
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'node_modules/**', '**/*.mjs', 'eslint.config.js', 'vitest.config.ts', 'apps/web/vite.config.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
);
```

`.prettierrc.json`:

```json
{ "singleQuote": true, "printWidth": 100, "trailingComma": "all" }
```

`.prettierignore`:

```text
node_modules
dist
coverage
package-lock.json
PERSONAL_AI_COMMAND_CENTER_PRD.md
```

- [ ] **Step 3: Install and run the smoke test to see it fail**

Run: `nvm use && npm install`
Expected: installs cleanly, writes `package-lock.json`, prints a warning that better-sqlite3 is not present (it is not) or nothing. No install-script warnings for approved packages.

Run: `npm test`
Expected: FAIL, because `packages/contracts/src/index.ts` does not exist yet. Keep the failing output as evidence.

- [ ] **Step 4: Create the source and run tests to see them pass**

`packages/contracts/src/index.ts`:

```ts
export const PRODUCT_NAME = 'Quack Command Center';
```

Run: `npm test`
Expected: PASS, 1 test. Also run `npm run typecheck` (expected: exits 0 with only the contracts reference).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .npmrc tsconfig.base.json tsconfig.json eslint.config.js .prettierrc.json .prettierignore vitest.config.ts packages/contracts
git commit -m "Scaffold workspaces, pinned toolchain and contracts package"
```

---

### Task 2: Environment schema with actionable errors (TDD)

**Files:**
- Create: `packages/config/{package.json,tsconfig.json,src/index.ts,src/env.ts,src/env.test.ts}`
- Modify: root `tsconfig.json` (add `{ "path": "packages/config" }` to `references`). Root `package.json` is unchanged, the workspaces glob picks the package up.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class ConfigError extends Error { readonly problems: readonly string[] }`
  - `interface ServerEnv { NODE_ENV: 'development' | 'test' | 'production'; HOST: string; PORT: number; DATA_DIR: string; LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' }`
  - `function loadServerEnv(raw: Readonly<Record<string, string | undefined>>): ServerEnv`

- [ ] **Step 1: Write the failing tests**

`packages/config/src/env.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { ConfigError, loadServerEnv } from './env.js';

const valid = { DATA_DIR: '/var/lib/quack' };

describe('loadServerEnv', () => {
  test('applies safe defaults and binds to loopback', () => {
    expect(loadServerEnv(valid)).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 4317,
      DATA_DIR: '/var/lib/quack',
      LOG_LEVEL: 'info',
    });
  });

  test('accepts explicit loopback hosts', () => {
    for (const HOST of ['127.0.0.1', '::1', 'localhost']) {
      expect(loadServerEnv({ ...valid, HOST }).HOST).toBe(HOST);
    }
  });

  test('rejects a non-loopback host and explains why', () => {
    const err = catchConfigError({ ...valid, HOST: '0.0.0.0' });
    expect(err.problems.join('\n')).toMatch(/HOST.*loopback.*tunnel/i);
  });

  test('requires DATA_DIR and says how to set it', () => {
    const err = catchConfigError({});
    expect(err.problems.join('\n')).toMatch(/DATA_DIR.*required.*absolute/i);
  });

  test('rejects a relative DATA_DIR', () => {
    expect(catchConfigError({ DATA_DIR: 'data' }).problems.join('\n')).toMatch(/DATA_DIR.*absolute/i);
  });

  test('rejects a non-numeric or out-of-range PORT', () => {
    expect(catchConfigError({ ...valid, PORT: 'abc' }).problems.join('\n')).toMatch(/PORT.*1024.*65535/);
    expect(catchConfigError({ ...valid, PORT: '80' }).problems.join('\n')).toMatch(/PORT.*1024.*65535/);
  });

  test('rejects an unknown NODE_ENV or LOG_LEVEL', () => {
    expect(catchConfigError({ ...valid, NODE_ENV: 'staging' }).problems.join('\n')).toMatch(/NODE_ENV/);
    expect(catchConfigError({ ...valid, LOG_LEVEL: 'loud' }).problems.join('\n')).toMatch(/LOG_LEVEL/);
  });

  test('reports every problem at once', () => {
    const err = catchConfigError({ HOST: '0.0.0.0', PORT: 'x' });
    expect(err.problems.length).toBe(3);
  });

  test('never echoes a supplied value in the message', () => {
    const err = catchConfigError({ DATA_DIR: 'relative-secret-value', HOST: 'evil-host-value', PORT: 'port-secret-value' });
    expect(err.message).not.toMatch(/relative-secret-value|evil-host-value|port-secret-value/);
  });
});

function catchConfigError(raw: Record<string, string | undefined>): ConfigError {
  try {
    loadServerEnv(raw);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadServerEnv to throw');
}
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- packages/config`
Expected: FAIL, `./env.js` not found.

- [ ] **Step 3: Write the package files and minimal implementation**

`packages/config/package.json`:

```json
{
  "name": "@quack/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "dependencies": { "zod": "4.4.3" }
}
```

`packages/config/tsconfig.json` is identical to the contracts one. Add `{ "path": "packages/config" }` to the root `tsconfig.json` references now.

`packages/config/src/env.ts`:

```ts
import { isAbsolute } from 'node:path';
import { z } from 'zod';

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'], { error: 'NODE_ENV must be development, test or production.' })
    .default('development'),
  HOST: z
    .string()
    .default('127.0.0.1')
    .refine((v) => LOOPBACK_HOSTS.has(v), {
      error: 'HOST must be a loopback address (127.0.0.1, ::1 or localhost). Remote access goes through a tunnel to loopback, never by binding a public interface.',
    }),
  PORT: z
    .string()
    .default('4317')
    .transform((v) => Number(v))
    .refine((n) => Number.isInteger(n) && n >= 1024 && n <= 65535, {
      error: 'PORT must be a whole number from 1024 to 65535.',
    }),
  DATA_DIR: z
    .string({ error: 'DATA_DIR is required. Set it to an absolute directory the service may write to.' })
    .refine((v) => isAbsolute(v), { error: 'DATA_DIR must be an absolute path.' }),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'], {
      error: 'LOG_LEVEL must be fatal, error, warn, info, debug or trace.',
    })
    .default('info'),
});

export type ServerEnv = z.infer<typeof schema>;

export function loadServerEnv(raw: Readonly<Record<string, string | undefined>>): ServerEnv {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new ConfigError(result.error.issues.map((issue) => issue.message));
}
```

`packages/config/src/index.ts`:

```ts
export { ConfigError, loadServerEnv } from './env.js';
export type { ServerEnv } from './env.js';
```

The tests define the required behavior. If a Zod 4 option name differs from the sketch above, change the implementation, not the tests. In particular every issue message must be one of the custom strings and must not contain the supplied value, and "reports every problem at once" expects exactly three problems for `{ HOST, PORT }` (HOST, PORT, missing DATA_DIR).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- packages/config`
Expected: PASS, 9 tests.

- [ ] **Step 5: Mutation-check the loopback rule**

Temporarily change `LOOPBACK_HOSTS` to include `'0.0.0.0'`, run `npm test -- packages/config`, confirm the loopback test fails, then restore.

- [ ] **Step 6: Commit**

```bash
git add packages/config tsconfig.json package-lock.json
git commit -m "Add validated server environment schema"
```

---

### Task 3: Guard against secrets in browser-exposed variables (TDD)

**Files:**
- Create: `packages/config/src/vite-env.ts`, `packages/config/src/vite-env.test.ts`
- Modify: `packages/config/src/index.ts`

**Interfaces:**
- Produces: `PUBLIC_ENV_PREFIX = 'VITE_'` and `assertNoSecretPublicEnv(env: Readonly<Record<string, string | undefined>>): void`, which throws `ConfigError` naming each offending variable, never its value.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { ConfigError } from './env.js';
import { PUBLIC_ENV_PREFIX, assertNoSecretPublicEnv } from './vite-env.js';

describe('assertNoSecretPublicEnv', () => {
  test('allows harmless public variables and server-only secrets', () => {
    expect(() => assertNoSecretPublicEnv({ VITE_APP_TITLE: 'x', SERVER_TOKEN: 'y' })).not.toThrow();
  });

  test.each(['VITE_API_TOKEN', 'VITE_SECRET', 'VITE_DB_PASSWORD', 'VITE_PROVIDER_KEY', 'VITE_AUTH_CODE', 'VITE_CREDENTIALS'])(
    'rejects %s',
    (name) => {
      expect(() => assertNoSecretPublicEnv({ [name]: 'value-that-must-not-leak' })).toThrow(ConfigError);
    },
  );

  test('names the variable but never prints the value', () => {
    try {
      assertNoSecretPublicEnv({ VITE_API_TOKEN: 'value-that-must-not-leak' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain('VITE_API_TOKEN');
      expect(String(error)).not.toContain('value-that-must-not-leak');
    }
  });

  test('exposes the prefix Vite must use', () => {
    expect(PUBLIC_ENV_PREFIX).toBe('VITE_');
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npm test -- packages/config` → FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
import { ConfigError } from './env.js';

export const PUBLIC_ENV_PREFIX = 'VITE_';

const SECRET_NAME = /(SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL|AUTH)/i;

export function assertNoSecretPublicEnv(env: Readonly<Record<string, string | undefined>>): void {
  const offenders = Object.keys(env).filter((name) => name.startsWith(PUBLIC_ENV_PREFIX) && SECRET_NAME.test(name));
  if (offenders.length === 0) return;
  throw new ConfigError(
    offenders.map((name) => `${name} looks like a secret but ${PUBLIC_ENV_PREFIX} variables are bundled into the browser. Rename it without the prefix and read it on the server only.`),
  );
}
```

Add to `index.ts`: `export { PUBLIC_ENV_PREFIX, assertNoSecretPublicEnv } from './vite-env.js';`

- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add packages/config && git commit -m "Guard browser-exposed env variables against secrets"`

---

### Task 4: Server entry point

**Files:**
- Create: `apps/server/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}`
- Modify: root `tsconfig.json` (add `{ "path": "apps/server" }` to `references`)

**Interfaces:**
- Consumes: `loadServerEnv`, `ServerEnv` from `@quack/config`, `PRODUCT_NAME` from `@quack/contracts`.
- Produces: `describeStartup(env: ServerEnv): string`. The module's `main()` runs only when executed directly.

- [ ] **Step 1: Failing test**

```ts
import { expect, test } from 'vitest';
import { describeStartup } from './index.js';

test('describes the loopback address the service will bind', () => {
  expect(
    describeStartup({ NODE_ENV: 'development', HOST: '127.0.0.1', PORT: 4317, DATA_DIR: '/var/lib/quack', LOG_LEVEL: 'info' }),
  ).toBe('Quack Command Center would listen on http://127.0.0.1:4317 (development)');
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**

`apps/server/package.json`:

```json
{
  "name": "@quack/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": { "@quack/config": "0.0.0", "@quack/contracts": "0.0.0" }
}
```

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../../packages/config" }, { "path": "../../packages/contracts" }]
}
```

`apps/server/src/index.ts`:

```ts
import { pathToFileURL } from 'node:url';
import { loadServerEnv, type ServerEnv } from '@quack/config';
import { PRODUCT_NAME } from '@quack/contracts';

export function describeStartup(env: ServerEnv): string {
  return `${PRODUCT_NAME} would listen on http://${env.HOST}:${String(env.PORT)} (${env.NODE_ENV})`;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(describeStartup(loadServerEnv(process.env)));
}
```

The Fastify server itself is TASK_013. This entry point only proves the env schema is wired and that the server package builds.

- [ ] **Step 4: Run tests and build.** `npm test -- apps/server` → PASS. `npm run build:server` → exits 0 and writes `apps/server/dist/index.js`.
- [ ] **Step 5: Run the built entry with a bad and a good environment**

`node apps/server/dist/index.js` → exits non-zero, prints the `Invalid configuration:` list naming `DATA_DIR`.
`DATA_DIR=/tmp/quack-check node apps/server/dist/index.js` → prints the listen line.

- [ ] **Step 6: Commit.** `git add apps/server package-lock.json tsconfig.json && git commit -m "Add server entry point wired to the environment schema"`

---

### Task 5: Web app scaffold with a secret-safe Vite config

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.tsx,src/App.tsx,src/styles.css}`

**Interfaces:**
- Consumes: `PRODUCT_NAME` from `@quack/contracts`, `assertNoSecretPublicEnv`, `PUBLIC_ENV_PREFIX` from `@quack/config`.
- Produces: `npm run build --workspace @quack/web` writes `apps/web/dist`.

- [ ] **Step 1: Write the files**

`apps/web/package.json`:

```json
{
  "name": "@quack/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "build": "vite build", "dev": "vite" },
  "dependencies": { "@quack/contracts": "0.0.0", "react": "19.2.8", "react-dom": "19.2.8" },
  "devDependencies": {
    "@quack/config": "0.0.0",
    "@tailwindcss/vite": "4.3.3",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.0.4",
    "tailwindcss": "4.3.3",
    "vite": "8.1.5"
  }
}
```

`apps/web/tsconfig.json` (not composite, no emit, Bundler resolution, JSX):

```json
{
  "compilerOptions": {
    "target": "ES2023", "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "Bundler", "jsx": "react-jsx",
    "strict": true, "noUncheckedIndexedAccess": true, "verbatimModuleSyntax": true,
    "isolatedModules": true, "noEmit": true, "skipLibCheck": false, "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`apps/web/vite.config.ts`:

```ts
import { loadEnv } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { PUBLIC_ENV_PREFIX, assertNoSecretPublicEnv } from '@quack/config';

export default defineConfig(({ mode }) => {
  assertNoSecretPublicEnv({ ...process.env, ...loadEnv(mode, process.cwd(), PUBLIC_ENV_PREFIX) });
  return { envPrefix: PUBLIC_ENV_PREFIX, plugins: [react(), tailwindcss()], build: { outDir: 'dist', sourcemap: false } };
});
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Quack Command Center</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/styles.css`: `@import 'tailwindcss';`

`apps/web/src/App.tsx`:

```tsx
import { PRODUCT_NAME } from '@quack/contracts';

export function App() {
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{PRODUCT_NAME}</h1>
    </main>
  );
}
```

`apps/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`vite.config.ts` imports `@quack/config` when Vite loads the config, and Node resolves that through the package's `dist` build. The web app also imports `@quack/contracts` from `dist`. So the web build must compile both packages first. Change the `build` script in `apps/web/package.json` to:

```json
"build": "tsc -b ../../packages/config ../../packages/contracts && vite build"
```

This keeps `npm run build:web` working from a clean checkout with no prior `tsc -b`.

- [ ] **Step 2: Type-check and build**

Run: `npm install && npm run typecheck && npm run build:web`
Expected: exits 0 and `apps/web/dist/index.html` exists.

- [ ] **Step 3: Commit.** `git add apps/web package-lock.json && git commit -m "Add web app scaffold with secret-safe Vite config"`

---

### Task 6: Build integration tests, including the secret canary (TDD)

**Files:**
- Create: `tests/integration/build.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const run = (args: string[], env: Record<string, string> = {}) =>
  execFileSync('npm', args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'pipe' });

function readAll(dir: string): string {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'))
    .join('\n');
}

describe('web build', () => {
  test('never bundles a server-only secret', () => {
    run(['run', 'build:web'], { QUACK_TEST_CANARY: 'canary-7f3a9c41-not-a-real-secret' });
    expect(readAll(join(root, 'apps/web/dist'))).not.toContain('canary-7f3a9c41-not-a-real-secret');
  });

  test('refuses to build when a secret-looking public variable is set', () => {
    expect(() => run(['run', 'build:web'], { VITE_API_TOKEN: 'canary-9d2e-not-a-real-secret' })).toThrow(/VITE_API_TOKEN/);
  });
});

describe('server build', () => {
  test('builds and refuses to start without DATA_DIR', () => {
    run(['run', 'build:server']);
    expect(() => execFileSync('node', ['apps/server/dist/index.js'], { cwd: root, env: { PATH: process.env.PATH ?? '' }, stdio: 'pipe' })).toThrow();
  });

  test('starts with a valid environment', () => {
    const out = execFileSync('node', ['apps/server/dist/index.js'], {
      cwd: root, env: { PATH: process.env.PATH ?? '', DATA_DIR: '/tmp/quack-integration' }, encoding: 'utf8',
    });
    expect(out).toContain('127.0.0.1');
  });
});
```

- [ ] **Step 2: Run to verify** `npm test -- tests/integration`. If the web and server builds already exist from earlier tasks the tests may pass at once. To see them fail for the right reason, mutate first: in `vite.config.ts` temporarily add `define: { __LEAK__: JSON.stringify(process.env.QUACK_TEST_CANARY) }` and reference `__LEAK__` in `App.tsx`. Confirm the canary test fails, then revert both.
- [ ] **Step 3: Restore the mutation and run again.** Expected: PASS, 4 tests.
- [ ] **Step 4: Commit.** `git add tests/integration && git commit -m "Test that builds never leak secrets and the server validates its environment"`

---

### Task 7: Lint and format the whole repository

**Files:** modify any file the linters flag.

- [ ] **Step 1:** `npm run format:check` → fails on files that are not formatted. Run `npm run format`, then `git diff --stat` and confirm only formatting changed. Do not reformat `PERSONAL_AI_COMMAND_CENTER_PRD.md` (ignored).
- [ ] **Step 2:** `npm run lint` → fix every reported problem in the new TypeScript. Do not disable a rule to make it pass unless you add a one-line comment giving the reason.
- [ ] **Step 3:** `npm run test:repo` still passes, including the source protection scan of the new files.
- [ ] **Step 4: Commit.** `git commit -am "Format and lint the workspace"`

---

### Task 8: Clean install proof, evidence and hand-off of task state

**Files:**
- Modify: `PERSONAL_AI_COMMAND_CENTER_PRD.md` (TASK_002 checkboxes, JSON, project state), `plan.md`, `progress.md`, `research.md` (record anything learned)

- [ ] **Step 1: Prove a clean install.** In a temporary directory outside the repository:

```bash
git clone <this repository's local path> "$TMPDIR/quack-clean" && cd "$TMPDIR/quack-clean"
nvm use && npm ci && npm run typecheck && npm test && npm run build
```

Expected: every command exits 0. Clone from the branch that has this work committed, not from `main`.

- [ ] **Step 2: Run the whole local check set** in the repository: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:repo`, `npm run scan:source`, `npm run scan:secrets`, `npm run build`. Copy the pass counts.
- [ ] **Step 3: Update the records only after the runs.** Tick TASK_002 acceptance criteria 1 to 7 and test requirements 1 to 4 in the PRD, set its JSON block to `completed`, `passing`, both booleans `true`, add the completion note, set `Current task` to TASK_003 in `plan.md` and the PRD project state, and append a dated `progress.md` entry with the exact commands and counts. Write "passes locally" and leave "passes in CI" until CI has actually run on the pull request.
- [ ] **Step 4: Open the pull request** against the branch it depends on (see below), watch `gh pr checks`, tick the CI box only when green, and record the run in `progress.md`.

---

## Self-review against the spec

- Criterion 1 (workspace commands from the root): root scripts in Task 1, proven in Task 8.
- Criterion 2 (strict): `tsconfig.base.json` and the web config.
- Criterion 3 (separate builds): `build:server`, `build:web`.
- Criterion 4 (exact versions in the lockfile): `.npmrc save-exact`, exact pins, `npm ci` in Task 8.
- Criterion 5 (Node pinned): `.nvmrc`, `engines`, `engine-strict`.
- Criterion 6 (env types and validation): Task 2. Test 4 (invalid environment fails with an actionable message): Tasks 2 and 6.
- Criterion 7 (no secret in a Vite variable): Tasks 3, 5 and 6.
- Test 1 (clean install), 2 (type-check), 3 (production build): Task 8.
- Open item deliberately left for TASK_003: coverage thresholds, CI, Playwright.
- Scanner rule fixes from the PR 2 review (email rule and `~` paths) are not in this task. If Task 1 adds a `repository` field or any SSH-style remote, stop and fix the rule test-first instead.
