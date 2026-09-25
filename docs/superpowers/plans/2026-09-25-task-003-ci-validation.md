# TASK_003 Continuous Integration and Validation Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `npm run validate` command runs the complete local validation, and CI runs the same checks on every pull request, blocks merging when any of them fails, and retains its reports.

**Architecture:** A second workflow (`.github/workflows/validate.yml`) joins the existing `secrets.yml`; the two stay separate so a scan failure and a build failure are distinguishable at a glance. Vitest splits into a fast `unit` project and a slow `integration` project so the build-running tests stop competing with unit tests for a single 30 second timeout. Playwright supplies the browser smoke test against the built web app. Every check CI runs is an npm script a developer can run locally by the same name, so the two can never drift.

**Tech Stack:** Node 24.21.0 (pinned in `.nvmrc`), npm workspaces, TypeScript 6.0.2, Vitest 4.1.11 with `@vitest/coverage-v8`, Playwright 1.63.0 (chromium only), gitleaks 8.30.1, GitHub Actions.

**Spec:** `PERSONAL_AI_COMMAND_CENTER_PRD.md`, "Task 003: Continuous integration and validation commands". The phase plan is `docs/superpowers/plans/2026-09-24-personal-ai-command-center.md`; the carry-ins and owner decisions are in `plan.md`.

## Global Constraints

- Node.js `>=24.21.0 <25`, from `.nvmrc`. Always `nvm use` before running anything; the machine default is Node 22.
- Every GitHub Action is pinned to a full 40-character commit SHA, never a tag. Resolved SHAs for the actions this plan uses:
  - `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` (v4)
  - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4)
  - `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` (v4)
- gitleaks stays at 8.30.1 with checksum `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`. The pinned install steps and the zero-commits guard in `scan-history.mjs` are not to be modified.
- Workflow tokens are read-only: every workflow file has a top-level `permissions:` block granting no more than `contents: read`, and no job widens it.
- No credential literal in any CI configuration. Caches may hold dependencies only, never secrets and never mutable database state.
- Coverage thresholds: 80 percent overall now. The 85 percent provider-adapter and 90 percent security-module and state-machine thresholds are added with those packages, which do not exist yet.
- A `dist` directory is only ever cached together with its `.tsbuildinfo`, never one without the other, or a stale `tsc -b` will skip a rebuild it needed to do (this was bug #11).
- Commit before mutation-testing a guard. Chain edit, checks and commit with `&&` so a failed check is never committed.
- Product name literal is `Quack Command Center`, exported as `PRODUCT_NAME` from `packages/contracts/src/index.ts`.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `vitest.config.ts` | Modify | Split into `unit` and `integration` projects; own coverage configuration and thresholds |
| `package.json` | Modify | The `validate` script and the per-project test scripts |
| `playwright.config.ts` | Create | Browser smoke configuration: chromium, built-app web server, trace and screenshot retention |
| `tests/e2e/smoke.spec.ts` | Create | The one browser smoke test against the built web app |
| `scripts/source-protection-scan.mjs` | Modify | Add commit author and committer metadata to what the deny-list covers |
| `tests/repo/source-protection.test.mjs` | Modify | Cover the new identity scanning |
| `tests/repo/repo-structure.test.mjs` | Modify | Workflow assertions over *every* workflow file; `validate` script assertions |
| `.github/workflows/validate.yml` | Create | The build-and-test workflow |
| `.github/workflows/secrets.yml` | Modify | Retro-pin its two actions to SHAs |
| `plan.md`, `progress.md`, `research.md`, PRD | Modify | Record results, last, once evidence exists |

## Issues closed by this plan

- **#13** — build integration tests run inside `npm test` under a 30 second timeout (Task 1).
- **#23** — source protection scan never checks commit author and committer metadata (Task 4). Task 4 also fixes an unreported defect in the same rule: a GitHub noreply address is flagged as personal, which blocks Task 8 from recording the repository's own commit identity.
- **#7** — CI permissions test misses job-level blocks and other workflow files (Task 5).

---

### Task 1: Split Vitest into unit and integration projects, with coverage thresholds

Closes #13. Today `tests/integration/build.integration.test.ts` runs real Vite and `tsc` builds inside `npm test` under the same 30 second timeout as a pure unit test. It is slow and flaky under load, and the timeout is simultaneously too long for unit tests and too short for builds.

**Files:**
- Modify: `vitest.config.ts` (whole file)
- Modify: `package.json:15-27` (the `scripts` block)
- Test: `tests/repo/repo-structure.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: npm scripts `test` (unit only), `test:integration`, `test:coverage`. Task 3 composes them into `validate`; Task 6 calls them from CI.

- [ ] **Step 1: Write the failing test**

Append to `tests/repo/repo-structure.test.mjs`:

```js
test('unit and integration tests are separate Vitest projects with separate timeouts', () => {
  const config = read('vitest.config.ts');
  assert.match(config, /name:\s*'unit'/, 'a project named unit must exist');
  assert.match(config, /name:\s*'integration'/, 'a project named integration must exist');

  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.test, 'vitest run --project unit');
  assert.equal(scripts['test:integration'], 'vitest run --project integration');
  assert.match(
    scripts['test:coverage'],
    /--coverage/,
    'test:coverage must actually collect coverage',
  );
});

test('coverage thresholds are set and cannot silently drop', () => {
  const config = read('vitest.config.ts');
  const thresholds = config.match(/thresholds:\s*\{[^}]*\}/s)?.[0];
  assert.ok(thresholds, 'coverage.thresholds must be configured');
  for (const metric of ['lines', 'functions', 'branches', 'statements']) {
    const value = Number(thresholds.match(new RegExp(`${metric}:\\s*(\\d+)`))?.[1]);
    assert.ok(value >= 80, `${metric} coverage threshold must be at least 80, found ${value}`);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
nvm use && npm run test:repo
```

Expected: FAIL. `a project named unit must exist`, and `scripts.test` is still `vitest run`.

- [ ] **Step 3: Rewrite `vitest.config.ts`**

Replace the whole file:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const alias = {
  '@quack/contracts': src('./packages/contracts/src/index.ts'),
  '@quack/config': src('./packages/config/src/index.ts'),
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
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
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
```

Note the deliberate change: `tests/integration` is removed from the unit project's `include`. Unit tests drop from a 30 second to a 5 second timeout, which is generous for a pure unit test and turns a hang into a fast failure.

- [ ] **Step 4: Update the scripts in `package.json`**

```json
"test": "vitest run --project unit",
"test:integration": "vitest run --project integration",
"test:coverage": "vitest run --project unit --coverage",
```

- [ ] **Step 5: Run both projects and verify the split is real**

```bash
nvm use && npm test && npm run test:integration
```

Expected: `npm test` passes and is noticeably faster than before, because it no longer runs builds. `npm run test:integration` runs the build tests and passes. Every test that passed before still runs in exactly one of the two projects — confirm the two counts add up to the 28 tests that passed before the split. If they do not, a file matches neither `include` pattern; fix the patterns rather than the count.

- [ ] **Step 6: Measure real coverage before trusting the threshold**

```bash
nvm use && npm run test:coverage
```

Read the printed table. The 80 percent threshold is a floor the PRD requires, not a number to tune to what the code happens to score. If coverage is below 80 percent, **write the missing tests** in this step until it passes; do not lower the threshold. If it is below 80 percent only because a file is genuinely untestable scaffolding, add that exact file to `coverage.exclude` with a comment saying why, and say so in the commit message.

- [ ] **Step 7: Run the repo tests and verify they now pass**

```bash
nvm use && npm run test:repo
```

Expected: PASS, including the two new tests.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json tests/repo/repo-structure.test.mjs && \
  npm run format:check && npm run lint && npm run test:repo && \
  git commit -m "Split Vitest into unit and integration projects with coverage thresholds

Closes #13."
```

- [ ] **Step 9: Mutation-check both new guards**

Do these one at a time, after the commit:

1. Change `scripts.test` back to `vitest run`. Run `npm run test:repo`. Expected: the project-split test FAILS. Restore with `git checkout package.json`.
2. Change the `lines` threshold to `70`. Run `npm run test:repo`. Expected: the threshold test FAILS with `lines coverage threshold must be at least 80, found 70`. Restore with `git checkout vitest.config.ts`.

If either mutation does not fail the intended test, the test is not doing its job — fix the test, not the mutation.

---

### Task 2: Playwright browser smoke test against the built web app

Satisfies PRD criterion 5, "Browser failures retain screenshots and traces". The web app today renders a single heading, so the smoke test asserts exactly that plus a clean console. It is deliberately small; it grows with TASK_015.

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (devDependency and the `test:e2e` script)
- Test: `tests/repo/repo-structure.test.mjs`

**Interfaces:**
- Consumes: `npm run build:web` from the existing scripts.
- Produces: npm script `test:e2e`. Artifacts at `playwright-report/` and `test-results/`, both already gitignored. Task 3 composes `test:e2e` into `validate`; Task 6 uploads the artifacts.

- [ ] **Step 1: Write the failing test**

Append to `tests/repo/repo-structure.test.mjs`:

```js
test('the browser smoke test retains screenshots and traces on failure', () => {
  assert.ok(existsSync(join(root, 'playwright.config.ts')), 'playwright.config.ts must exist');
  const config = read('playwright.config.ts');
  assert.match(config, /screenshot:\s*'only-on-failure'/, 'failures must keep a screenshot');
  assert.match(config, /trace:\s*'retain-on-failure'/, 'failures must keep a trace');
  assert.match(config, /video:\s*'retain-on-failure'/, 'failures must keep a video');

  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['test:e2e'], 'playwright test');
  assert.ok(existsSync(join(root, 'tests/e2e/smoke.spec.ts')), 'a smoke spec must exist');

  const ignore = read('.gitignore').split('\n');
  for (const entry of ['playwright-report', 'test-results']) {
    assert.ok(ignore.includes(entry), `${entry} must be gitignored, never committed`);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
nvm use && npm run test:repo
```

Expected: FAIL with `playwright.config.ts must exist`.

- [ ] **Step 3: Install Playwright, pinned, and its browser**

```bash
nvm use && npm install -D --save-exact @playwright/test@1.63.0 && npx playwright install chromium
```

`--save-exact` matters: PRD criterion 4 of TASK_002 requires exact versions in the lockfile. Confirm `package.json` shows `"@playwright/test": "1.63.0"` with no caret.

- [ ] **Step 4: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    cwd: 'apps/web',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

`vite preview` serves the built `dist`, not the dev server, so the smoke test exercises the production build. The test therefore requires `npm run build:web` to have run first — Task 3 and Task 6 both order it that way.

- [ ] **Step 5: Write the smoke spec**

Create `tests/e2e/smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('the built web app renders the command center shell with a clean console', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));

  const response = await page.goto('/');
  expect(response?.status(), 'the app must be served, not a 404').toBe(200);

  await expect(page).toHaveTitle('Quack Command Center');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quack Command Center');

  expect(problems, 'the page must load without console or page errors').toEqual([]);
});
```

- [ ] **Step 6: Add the script to `package.json`**

```json
"test:e2e": "playwright test",
```

- [ ] **Step 7: Build the web app and run the smoke test**

```bash
nvm use && npm run build:web && npm run test:e2e
```

Expected: PASS, one test, chromium.

- [ ] **Step 8: Prove the artifacts really are retained on failure**

This is the actual criterion, so prove it rather than assume it. Temporarily change the expected title in the spec to `Wrong Title`, then:

```bash
nvm use && npm run test:e2e; ls -R test-results | head -20
```

Expected: the test FAILS, and `test-results/` contains a `.png` screenshot, a `trace.zip` and a `.webm` video. Confirm all three are present, then restore the spec with `git checkout tests/e2e/smoke.spec.ts` (or undo the edit if not yet committed) and re-run to green.

- [ ] **Step 9: Run the repo tests and commit**

```bash
nvm use && npm run test:repo && npm run format:check && npm run lint && \
  git add playwright.config.ts tests/e2e/smoke.spec.ts package.json package-lock.json \
    tests/repo/repo-structure.test.mjs && \
  git commit -m "Add a Playwright browser smoke test that retains screenshots and traces"
```

- [ ] **Step 10: Mutation-check the guard**

After the commit, change `screenshot: 'only-on-failure'` to `screenshot: 'off'`. Run `npm run test:repo`. Expected: FAIL with `failures must keep a screenshot`. Restore with `git checkout playwright.config.ts`.

---

### Task 3: The single `npm run validate` command

Satisfies PRD criterion 1, "One command runs the complete local validation".

**Files:**
- Modify: `package.json` (the `validate` script)
- Test: `tests/repo/repo-structure.test.mjs`

**Interfaces:**
- Consumes: `format:check`, `lint`, `typecheck`, `test:repo`, `test:coverage`, `build`, `test:integration`, `test:e2e`, `scan:source`, `scan:secrets`, `scan:secrets:history`.
- Produces: npm script `validate`. Task 6 does **not** call it as one blob — CI splits it across jobs for parallelism and artifact handling — so the repo test in this task pins the two to the same set of checks.

- [ ] **Step 1: Write the failing test**

Append to `tests/repo/repo-structure.test.mjs`:

```js
const VALIDATE_STEPS = [
  'format:check',
  'lint',
  'typecheck',
  'test:repo',
  'test:coverage',
  'build',
  'test:integration',
  'test:e2e',
  'scan:source',
  'scan:secrets',
  'scan:secrets:history',
];

test('one command runs the complete local validation', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.ok(scripts.validate, 'a validate script must exist');
  for (const step of VALIDATE_STEPS) {
    assert.ok(scripts[step], `validate refers to ${step}, which must itself be a script`);
    assert.match(
      scripts.validate,
      new RegExp(`\\bnpm run ${step.replace(':', ':')}\\b`),
      `validate must run ${step}`,
    );
  }
});

test('validate runs the cheap checks before the expensive ones', () => {
  const validate = JSON.parse(read('package.json')).scripts.validate;
  const at = (step) => validate.indexOf(`npm run ${step}`);
  assert.ok(at('format:check') < at('lint'), 'format check is cheapest, it goes first');
  assert.ok(at('lint') < at('typecheck'), 'lint before type-check');
  assert.ok(at('typecheck') < at('test:coverage'), 'type-check before unit tests');
  assert.ok(at('build') < at('test:e2e'), 'the browser test needs the build to exist first');
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
nvm use && npm run test:repo
```

Expected: FAIL with `a validate script must exist`.

- [ ] **Step 3: Add the `validate` script**

In `package.json`, on one line:

```json
"validate": "npm run format:check && npm run lint && npm run typecheck && npm run test:repo && npm run test:coverage && npm run build && npm run test:integration && npm run test:e2e && npm run scan:source && npm run scan:secrets && npm run scan:secrets:history",
```

`&&` throughout, so the first failure stops the run and nothing downstream reports a misleading pass.

- [ ] **Step 4: Run the repo tests and verify they pass**

```bash
nvm use && npm run test:repo
```

Expected: PASS.

- [ ] **Step 5: Run the whole thing, for real, once**

```bash
nvm use && npm run validate
```

Expected: every step passes end to end. This is PRD test requirement 2, "A clean validation run passes". Record the wall-clock time; if it exceeds about five minutes, note it in `progress.md` as a number to watch rather than acting on it now.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/repo/repo-structure.test.mjs && \
  npm run format:check && npm run lint && npm run test:repo && \
  git commit -m "Add npm run validate, the single complete local validation command"
```

- [ ] **Step 7: Mutation-check the guard**

After the commit, delete `&& npm run test:e2e` from the `validate` script. Run `npm run test:repo`. Expected: FAIL with `validate must run test:e2e`. Restore with `git checkout package.json`.

---

### Task 4: Scan commit metadata, and stop flagging GitHub noreply addresses

Closes #23, and fixes a second defect in the same scanner that writing this plan exposed.

**The reported defect.** When the repository was made public on 2026-09-25, `scan:source`, `scan:secrets` and `scan:secrets:history` were all green while a personal name and email sat in the author field of 30 of 36 commits, because the scanner reads file content only. The history has been rewritten, but nothing stops it recurring.

**The defect found while planning.** The file-content email rule exempts only the `example.*` domains, so it flags a GitHub noreply address as a personal one. That makes it impossible to write this repository's own commit identity into `research.md` — which Task 8 has to do. Both are one rule's problem, so both are fixed here, sharing a single allowlist constant.

**Files:**
- Modify: `scripts/source-protection-scan.mjs`
- Test: `tests/repo/source-protection.test.mjs`

**Interfaces:**
- Consumes: the existing `loadDenylist(path)` and `scanFiles(rootDir, files, denylist)` exports.
- Produces: exports `scanIdentities(identities, denylist)` and `readIdentities(rootDir)`. `scanIdentities` takes `Array<{ commit: string, field: 'author-name' | 'author-email' | 'committer-name' | 'committer-email', value: string }>` and returns the same `{ file, line, rule }` finding shape the existing `scanFiles` returns, so the main block can concatenate the two lists without special-casing. Also produces the module-level `ALLOWED_IDENTITY_EMAIL` constant, which both the identity scan and the file-content email rule consult, so Task 8 can record the repository's commit identity in `research.md` without tripping the scan.

- [ ] **Step 1: Write the failing test**

Append to `tests/repo/source-protection.test.mjs`:

```js
import { scanIdentities } from '../../scripts/source-protection-scan.mjs';

const identity = (value, field = 'author-email') => [{ commit: 'abc1234', field, value }];

// Assembled from parts deliberately. This repository scans its own files, and the
// file-content email rule rejects any literal address outside example.com — this
// plan document included. Step 5 below teaches that rule about the noreply forms;
// until then, a literal here would fail `npm run scan:source`.
const NOREPLY_USER = ['60458184+someone', 'users.noreply.github.com'].join('@');
const NOREPLY_BOT = ['noreply', 'github.com'].join('@');

test('a GitHub noreply identity is allowed', () => {
  assert.deepEqual(scanIdentities(identity(NOREPLY_USER), []), []);
  assert.deepEqual(scanIdentities(identity(NOREPLY_BOT), []), []);
});

test('a personal email in commit metadata is a finding', () => {
  const findings = scanIdentities(identity('someone@example.com'), []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'identity-email');
  assert.equal(findings[0].file, 'commit abc1234');
});

test('a deny-listed name in commit metadata is a finding', () => {
  const findings = scanIdentities(identity('Ada', 'author-name'), ['ada']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'deny-list');
});

test('identity findings never print the matched text', () => {
  const findings = scanIdentities(identity('hidden@example.com'), ['hidden']);
  for (const f of findings) {
    assert.ok(!JSON.stringify(f).includes('hidden@example.com'));
    assert.ok(!JSON.stringify(f).includes('hidden'));
  }
});

test('committer metadata is scanned, not just author metadata', () => {
  assert.equal(scanIdentities(identity('someone@example.com', 'committer-email'), []).length, 1);
  assert.equal(scanIdentities(identity('Ada', 'committer-name'), ['ada']).length, 1);
});

test('this repository has no deny-listed identity in any commit', () => {
  const findings = scanIdentities(readIdentities(root), loadDenylist(denylistPath));
  assert.deepEqual(findings, [], 'commit metadata must be free of personal identities');
});
```

Add `readIdentities` to the existing import from `scripts/source-protection-scan.mjs`, and reuse whatever `root` and `denylistPath` bindings that test file already defines — read the top of the file first rather than assuming their names.

- [ ] **Step 2: Run the test and verify it fails**

```bash
nvm use && npm run test:repo
```

Expected: FAIL with `scanIdentities is not a function`.

- [ ] **Step 3: Implement the scanning in `scripts/source-protection-scan.mjs`**

Add after the existing `RULES` definition:

```js
// Commit metadata is not file content, so the file rules do not apply to it. The
// only identities allowed to author a commit here are GitHub's noreply forms.
const ALLOWED_IDENTITY_EMAIL =
  /^(?:[A-Za-z0-9._%+-]+@users\.noreply\.github\.com|noreply@github\.com)$/;

export function scanIdentities(identities, denylist) {
  const findings = [];
  const deny = denylist.map((d) => d.toLowerCase());
  for (const { commit, field, value } of identities) {
    if (field.endsWith('-email') && !ALLOWED_IDENTITY_EMAIL.test(value)) {
      findings.push({ file: `commit ${commit}`, line: field, rule: 'identity-email' });
    }
    const lower = value.toLowerCase();
    for (const d of deny) {
      if (lower.includes(d)) {
        findings.push({ file: `commit ${commit}`, line: field, rule: 'deny-list' });
      }
    }
  }
  return findings;
}

export function readIdentities(rootDir) {
  const out = execFileSync('git', ['log', '--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce', '--all'], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const identities = [];
  for (const line of out.split('\n').filter(Boolean)) {
    const [commit, an, ae, cn, ce] = line.split('\x1f');
    identities.push({ commit: commit.slice(0, 7), field: 'author-name', value: an });
    identities.push({ commit: commit.slice(0, 7), field: 'author-email', value: ae });
    identities.push({ commit: commit.slice(0, 7), field: 'committer-name', value: cn });
    identities.push({ commit: commit.slice(0, 7), field: 'committer-email', value: ce });
  }
  return identities;
}
```

`%x1f` is the ASCII unit separator, which cannot appear in a name or an email, so it is a safe field delimiter where a comma or a space is not.

- [ ] **Step 4: Call it from the main block**

In the `if (isMain)` block, replace the single `findings` assignment:

```js
  const findings = [
    ...scanFiles(rootDir, trackedFiles(rootDir), denylist),
    ...scanIdentities(readIdentities(rootDir), denylist),
  ];
```

The existing reporting loop and exit code need no change, because `scanIdentities` returns the same finding shape.

- [ ] **Step 5: Teach the file-content email rule about the noreply forms**

Writing this plan surfaced a second, separate defect in the same scanner. The file-content `EMAIL` rule exempts only `example.com`, `example.org` and `example.net`, so **`research.md` cannot record this repository's own commit identity** — a GitHub noreply address is flagged exactly as if it were a personal one. Task 8 has to write that identity down, so fix the rule here.

First, the failing test. Append to `tests/repo/source-protection.test.mjs`:

```js
test('a GitHub noreply address is not a personal address in file content', () => {
  const noreply = ['60458184+someone', 'users.noreply.github.com'].join('@');
  assert.deepEqual(scanText(`commit identity is Lena <${noreply}>\n`), []);
  assert.deepEqual(scanText(`bot identity is ${['noreply', 'github.com'].join('@')}\n`), []);
});

test('a genuinely personal address in file content is still a finding', () => {
  const personal = ['someone', 'somewhere.test'].join('@');
  const findings = scanText(`write to ${personal}\n`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'email-address');
});
```

Reuse the `scanText` helper that file already defines; read the top of the file to confirm its exact signature rather than assuming it.

`tests/repo/source-protection.test.mjs` is on the scanner's `SELF_EXCLUDED` list, so once these tests live in that file a plain literal would be fine there. They are assembled from parts here because *this plan document* is not excluded and is scanned like any other file.

Run `npm run test:repo` and confirm the first test FAILS before continuing.

Then narrow the rule in `scripts/source-protection-scan.mjs`. Replace the `email-address` entry in `RULES`:

```js
  {
    rule: 'email-address',
    matches: (text) =>
      [...text.matchAll(EMAIL)].some((m) => m[1] !== 'git' && !ALLOWED_IDENTITY_EMAIL.test(m[0])),
  },
```

`ALLOWED_IDENTITY_EMAIL` is already defined above for the identity scan, so the two paths share one definition and cannot drift apart. Re-run `npm run test:repo`: both new tests pass, and every existing `source-protection` test still passes — particularly the ones asserting that a personal address *is* caught. If any of those now pass wrongly, the exemption is too wide.

- [ ] **Step 6: Run the tests and the scan, and verify they pass**

```bash
nvm use && npm run test:repo && npm run scan:source
```

Expected: PASS, and the scan still prints `source protection scan passed`. If it reports an `identity-email` finding, a commit in this repository still carries a personal address — stop and report it rather than weakening the rule.

- [ ] **Step 7: Commit**

```bash
git add scripts/source-protection-scan.mjs tests/repo/source-protection.test.mjs && \
  npm run format:check && npm run lint && npm run test:repo && \
  git commit -m "Scan commit metadata, and stop flagging GitHub noreply addresses

Closes #23."
```

- [ ] **Step 8: Mutation-check the guard against a real commit**

This guard protects against a bad commit, so prove it with one, after committing the work above. Note the two separate checks — `$?` must be read directly, not through a pipe, or it reports the exit code of the last command in the pipeline instead of the scan's:

```bash
git commit --allow-empty --author="Ada Lovelace <ada@example.com>" -m "THROWAWAY: prove the identity scan catches a personal address"
npm run scan:source
echo "exit: $?"
```

Expected: the scan FAILS with an `identity-email` finding naming the commit, and prints no email address. Then remove the throwaway commit:

```bash
git reset --hard HEAD~1 && npm run scan:source
```

Expected: passes again. Confirm `git log -1 --format=%s` shows your real commit, not the throwaway.

---

### Task 5: Workflow permissions test over every workflow file

Closes #7. The current test reads `.github/workflows/secrets.yml` by name and checks only the top-level `permissions:` block. Task 6 adds a second workflow the test cannot see, and a job-level `permissions:` can widen a token even when the top-level block is read-only.

**Files:**
- Modify: `tests/repo/repo-structure.test.mjs:145-150` (replace the `CI keeps the workflow token read-only` test)
- Test: same file

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks import. Task 6's workflow must satisfy it.

- [ ] **Step 1: Write the failing test**

Replace the existing `CI keeps the workflow token read-only` test with:

```js
const workflowFiles = () =>
  readdirSync(join(root, '.github/workflows'))
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => `.github/workflows/${f}`);

test('every workflow file exists and is discovered, not hard-coded', () => {
  const files = workflowFiles();
  assert.ok(files.length >= 1, 'there must be at least one workflow');
  assert.ok(
    files.includes('.github/workflows/secrets.yml'),
    'the secrets workflow must still be there',
  );
});

test('every workflow keeps its token read-only, at the top level and in every job', () => {
  for (const file of workflowFiles()) {
    const wf = read(file);
    assert.match(
      wf,
      /^permissions:\n {2}contents:\s*read$/m,
      `${file} must declare a read-only top-level permissions block`,
    );
    assert.doesNotMatch(wf, /:\s*write\b/, `${file} grants a write scope somewhere`);
    assert.doesNotMatch(
      wf,
      /^ {4}permissions:/m,
      `${file} sets a job-level permissions block, which can widen the top-level one`,
    );
  }
});

test('no workflow contains a credential literal', () => {
  const CREDENTIAL = /(?:ghp_|github_pat_|gho_|AKIA|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  for (const file of workflowFiles()) {
    assert.doesNotMatch(read(file), CREDENTIAL, `${file} contains a credential literal`);
    assert.doesNotMatch(
      read(file),
      /\b[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)\s*:\s*['"]?[A-Za-z0-9_\-]{16,}/,
      `${file} assigns a hard-coded credential value`,
    );
  }
});

test('every action in every workflow is pinned to a commit SHA, not a tag', () => {
  for (const file of workflowFiles()) {
    for (const [, ref] of read(file).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)) {
      assert.match(
        ref,
        /@[0-9a-f]{40}$/,
        `${file} uses ${ref}, which is a moving tag; pin it to a 40-character commit SHA`,
      );
    }
  }
});
```

Add `readdirSync` to the existing `node:fs` import at the top of the file.

- [ ] **Step 2: Run the test and verify it fails**

```bash
nvm use && npm run test:repo
```

Expected: FAIL on the SHA-pinning test — `secrets.yml uses actions/checkout@v4, which is a moving tag`. The permissions and credential tests should already pass against the current `secrets.yml`; if either fails, that is a real finding in the existing workflow, so fix the workflow.

- [ ] **Step 3: Retro-pin the actions in `secrets.yml`**

```yaml
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version-file: .nvmrc
```

Keep the `# v4` comment: the SHA is what is enforced, the comment is what makes it reviewable.

- [ ] **Step 4: Run the tests and verify they pass**

```bash
nvm use && npm run test:repo
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/repo/repo-structure.test.mjs .github/workflows/secrets.yml && \
  npm run format:check && npm run lint && npm run test:repo && \
  git commit -m "Check permissions, credentials and SHA pinning in every workflow file

Closes #7."
```

- [ ] **Step 6: Mutation-check all three guards**

One at a time, after the commit, each time restoring with `git checkout .github/workflows/secrets.yml`:

1. Add `    permissions:\n      contents: write` under the `scan:` job. Run `npm run test:repo`. Expected: FAIL on the job-level permissions assertion.
2. Change one pinned SHA back to `actions/checkout@v4`. Expected: FAIL on the SHA-pinning assertion.
3. Add `          GH_TOKEN: <a fake token, assembled at mutation time>` to the workflow `env:`. Expected: FAIL on the credential-literal assertion.

---

### Task 6: The `validate.yml` CI workflow

Satisfies PRD criteria 2, 3 and 4. Two jobs so a build failure and a browser failure are distinguishable, and so the browser job's artifacts upload independently.

**Files:**
- Create: `.github/workflows/validate.yml`
- Test: `tests/repo/repo-structure.test.mjs`

**Interfaces:**
- Consumes: the npm scripts from Tasks 1 to 3.
- Produces: two required check names, `validate` and `e2e`, which Task 7's ruleset requires by exactly those strings.

- [ ] **Step 1: Write the failing test**

Append to `tests/repo/repo-structure.test.mjs`:

```js
test('CI runs the full validation on a supported Node LTS, caching dependencies only', () => {
  const wf = read('.github/workflows/validate.yml');
  assert.match(wf, /node-version-file:\s*\.nvmrc/, 'Node version comes from .nvmrc, never inline');
  assert.match(wf, /cache:\s*npm/, 'dependencies are cached');
  assert.doesNotMatch(wf, /\.env|data\/|\.db\b/, 'never cache secrets or mutable database state');
  for (const step of ['format:check', 'lint', 'typecheck', 'test:repo', 'test:coverage', 'build']) {
    assert.match(wf, new RegExp(`npm run ${step}\\b`), `CI must run ${step}`);
  }
  assert.match(wf, /npm run test:integration\b/, 'CI must run the integration project');
  assert.match(wf, /npm run test:e2e\b/, 'CI must run the browser smoke test');
  assert.match(wf, /npm ci\b/, 'CI installs from the lockfile, never npm install');
});

test('CI retains coverage and browser failure artifacts', () => {
  const wf = read('.github/workflows/validate.yml');
  assert.match(wf, /actions\/upload-artifact@[0-9a-f]{40}/, 'artifacts are uploaded');
  assert.match(wf, /coverage/, 'coverage must be retained');
  assert.match(wf, /playwright-report/, 'the browser report must be retained');
  assert.match(wf, /test-results/, 'screenshots, traces and videos must be retained');
  assert.match(wf, /if:\s*(?:!cancelled\(\)|always\(\))/, 'artifacts must upload even on failure');
});

test('the required check names the ruleset depends on do not drift', () => {
  const wf = read('.github/workflows/validate.yml');
  assert.match(wf, /^ {2}validate:$/m, 'the job must be named validate');
  assert.match(wf, /^ {2}e2e:$/m, 'the job must be named e2e');
});

test('a dist cache is never keyed without its build info', () => {
  const wf = read('.github/workflows/validate.yml');
  if (/path:[^\n]*dist/.test(wf)) {
    assert.match(wf, /tsbuildinfo/, 'caching dist without its .tsbuildinfo causes stale builds');
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
nvm use && npm run test:repo
```

Expected: FAIL with `ENOENT` for `.github/workflows/validate.yml`.

- [ ] **Step 3: Create `.github/workflows/validate.yml`**

```yaml
name: validate

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: validate-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install from the lockfile
        run: npm ci
      - name: Format check
        run: npm run format:check
      - name: Lint
        run: npm run lint
      - name: Type check
        run: npm run typecheck
      - name: Repository tests
        run: npm run test:repo
      - name: Unit tests with coverage
        run: npm run test:coverage
      - name: Build
        run: npm run build
      - name: Integration tests
        run: npm run test:integration
      - name: Retain the coverage report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with:
          name: coverage
          path: coverage
          retention-days: 14
          if-no-files-found: error

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install from the lockfile
        run: npm ci
      - name: Install the chromium browser
        run: npx playwright install --with-deps chromium
      - name: Build the web application
        run: npm run build:web
      - name: Browser smoke test
        run: npm run test:e2e
      - name: Retain the browser report and failure artifacts
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with:
          name: playwright-report
          path: |
            playwright-report
            test-results
          retention-days: 14
          if-no-files-found: ignore
```

Two deliberate choices. `if: ${{ !cancelled() }}` rather than `if: success()`, because an artifact is most valuable on the run that failed. `if-no-files-found: error` on coverage, because a silently missing coverage report is exactly the kind of green-tick-proving-nothing that bug #3 was. `test-results` uses `ignore`, because it is correctly empty when nothing failed.

No `dist` cache is configured. The builds here take seconds and the Global Constraints rule about pairing `dist` with its `.tsbuildinfo` is a trap worth not walking into for no gain; the repo test enforces the pairing if a future change adds one.

- [ ] **Step 4: Run the repo tests and verify they pass**

```bash
nvm use && npm run test:repo
```

Expected: PASS, including the Task 5 tests, which now also apply to this new file — it must have a read-only top-level `permissions:` block, no job-level block, no credential literal and only SHA-pinned actions.

- [ ] **Step 5: Commit and push, then confirm CI is actually green**

```bash
git add .github/workflows/validate.yml tests/repo/repo-structure.test.mjs && \
  npm run format:check && npm run lint && npm run test:repo && \
  git commit -m "Add the validate workflow: build, tests, coverage and browser smoke in CI"
```

Push the branch and open the pull request. Then wait for the run and check it, comparing the run's `headSha` against the pull request head before citing it as evidence:

```bash
gh pr checks --watch
gh run list --branch phase-1/task-003-ci-validation --limit 3
```

Expected: `validate`, `e2e` and `scan` all pass. Download the coverage artifact once and confirm it is not empty. Do not write any claim into `progress.md` until this has actually happened.

---

### Task 7: Branch protection, and the fixture that proves CI blocks

Satisfies PRD criterion 6 and test requirement 1. The owner decided on 2026-09-25 to make the repository public specifically so that required status checks are available; the repository is public as of that date.

**Files:**
- No repository files. This task configures GitHub and produces evidence.

**Interfaces:**
- Consumes: the check names `validate` and `e2e` from Task 6, and `scan` from the existing `secrets.yml`.
- Produces: the recorded evidence Task 8 writes down.

- [ ] **Step 1: Confirm the check names exactly as GitHub sees them**

```bash
gh pr checks --json name,state --jq '.[].name'
```

Expected: `validate`, `e2e`, `scan`. Use these exact strings in the next step; a ruleset that requires a check name that never reports will block every merge forever.

- [ ] **Step 2: Create the ruleset on `main`**

```bash
gh api repos/lenacodes848/app-quack-command-center/rulesets \
  --method POST \
  -f name='main protection' \
  -f target='branch' \
  -f enforcement='active' \
  -f 'conditions[ref_name][include][]=~DEFAULT_BRANCH' \
  -f 'rules[][type]=deletion' \
  -f 'rules[][type]=non_fast_forward' \
  -f 'rules[][type]=pull_request' \
  -f 'rules[][type]=required_status_checks' \
  -F 'rules[][parameters][strict_required_status_checks_policy]=true' \
  -f 'rules[][parameters][required_status_checks][][context]=validate' \
  -f 'rules[][parameters][required_status_checks][][context]=e2e' \
  -f 'rules[][parameters][required_status_checks][][context]=scan'
```

If the nested-array form is rejected, write the same payload to a JSON file and use `gh api ... --input rules.json`. Put that file in a scratch directory, not the repository.

`non_fast_forward` matters here: it blocks the force-push that silently broke pull request #21 during the identity rewrite on 2026-09-25.

- [ ] **Step 3: Verify the ruleset is active and correct**

```bash
gh api repos/lenacodes848/app-quack-command-center/rulesets --jq '.[] | {id, name, enforcement}'
gh api repos/lenacodes848/app-quack-command-center/rules/branches/main --jq '.[].type'
```

Expected: the ruleset is `active`, and the rules list includes `required_status_checks`, `pull_request`, `deletion` and `non_fast_forward`.

- [ ] **Step 4: Prove CI blocks, with a deliberately failing fixture**

This is PRD test requirement 1, and it must be proved, not assumed.

```bash
git checkout -b verify/ci-blocks-on-failure main
printf 'const unused_variable = 1\n' > tests/e2e/deliberate-failure.ts
git add tests/e2e/deliberate-failure.ts
git commit -m "THROWAWAY: prove CI blocks a failing check (do not merge)"
```

Push it and open a pull request whose title starts with `THROWAWAY`. Then:

```bash
gh pr checks --watch
gh pr view --json mergeable,mergeStateStatus
```

Expected: the `validate` check FAILS on lint or type-check, `mergeStateStatus` is `BLOCKED`, and the merge button is unavailable. Capture that output verbatim — it is the evidence for the PRD box.

- [ ] **Step 5: Clean up the fixture**

```bash
gh pr close <number> --delete-branch
git checkout phase-1/task-003-ci-validation
git branch -D verify/ci-blocks-on-failure
```

Confirm with `gh pr list --state open` that no throwaway pull request is left open, and with `git branch -a` that the branch is gone locally and remotely.

---

### Task 8: Record the results

Last, and only after every check above has actually run. The rule on this project is that no claim is written before its evidence exists, and that a claim says exactly what the evidence covers.

**Files:**
- Modify: `plan.md`, `progress.md`, `research.md`, `PERSONAL_AI_COMMAND_CENTER_PRD.md`

- [ ] **Step 1: Rebase onto the merged wrap-up work**

Pull request #22 touches `plan.md`, `progress.md` and `research.md`. If it has merged, rebase first so this task edits the current text:

```bash
git fetch origin && git rebase origin/main
```

If #22 is still open, stop and say so rather than guessing at a resolution.

- [ ] **Step 2: Tick the PRD boxes, with evidence, and only the ones earned**

In `PERSONAL_AI_COMMAND_CENTER_PRD.md`, Task 003: tick acceptance criteria 1 to 6 and test requirements 1 to 3. Below the JSON block, write a completion line naming the run IDs and what each covered, separating what passes locally from what passes in CI. Set `"status": "completed"`, `"tests_status": "passing"`, `"unit_tests_passing": true`, `"integration_tests_passing": true`.

- [ ] **Step 3: Update `plan.md`**

Set `Current task: TASK_004`. Move TASK_003 into "Recently completed". Remove open item 5 (branch protection), now decided and implemented, and open item 6's CI half. Rewrite "Next steps (resume here)" so step 1 is TASK_004, and add the Phase 1 completion state.

- [ ] **Step 4: Append to `progress.md`**

Append, never rewrite. Record: what TASK_003 delivered, the exact local and CI evidence with run IDs, the throwaway fixture result proving CI blocks, the three issues closed (#7, #13, #23), and the coverage number actually measured.

- [ ] **Step 5: Record the decisions in `research.md`**

Add to the decisions table:

- The repository is public as of 2026-09-25, chosen by the owner so that required status checks are available on this plan.
- All 36 commits were rewritten on 2026-09-25 to replace a personal author and committer identity with the owner's GitHub noreply form. Trees were verified byte-identical before and after. Record the resulting identity by copying it out of `git config user.email`, not by retyping it — and note that it is set **repository-locally**, because the machine's global git config still carries a personal address, so a fresh clone would silently inherit the wrong one.
- The force-push that rewrite required made GitHub mark pull request #21 as merged when it was not. The `non_fast_forward` rule added in Task 7 prevents a repeat.

Add to Environment notes: `scan:secrets:history` reporting 28 commits while `main` has 36 is correct, not a gap, because the other 8 are merge commits which carry no new content and gitleaks skips by design (`28 == git rev-list --no-merges --count`).

Writing the identity into `research.md` only works once Task 4 step 5 has shipped; before that, the scanner rejects a noreply address as personal. If `npm run scan:source` fails on `research.md` here, Task 4 step 5 was skipped.

- [ ] **Step 6: Run the full validation once more and commit**

```bash
nvm use && npm run validate && \
  git add plan.md progress.md research.md PERSONAL_AI_COMMAND_CENTER_PRD.md && \
  git commit -m "Record TASK_003 results: CI, validation command and branch protection

Closes #7. Closes #13. Closes #23."
```

- [ ] **Step 7: Confirm CI is green on the final head, then hand to the owner**

```bash
gh pr checks --watch
```

Compare the run's head SHA with the pull request head before saying it passed. Then tell the owner the pull request is ready, listing the merge-blocking and non-blocking items, and the four issues left open (#6, #12, #14, #15).

---

## Self-Review

**Spec coverage.** All six acceptance criteria and all three test requirements map to tasks: criterion 1 to Task 3; criterion 2 to Task 6; criterion 3 to Task 6; criterion 4 to Task 6; criterion 5 to Task 2 with Task 6 uploading; criterion 6 to Task 7. Test requirement 1 to Task 7 step 4; requirement 2 to Task 3 step 5; requirement 3 to Task 5's credential-literal test. The carry-ins from `plan.md` are covered: SHA pinning in Tasks 5 and 6, `npm ci` and the toolchain checks in Task 6, coverage thresholds in Task 1, Playwright browser install in Task 6, the `dist`-with-build-info rule as a conditional guard in Task 6, and the gitleaks steps left untouched.

**Not in scope, deliberately.** Issues #6, #12, #14 and #15 stay open; they are unrelated to CI and folding them in would make one pull request too large to review. The 85 and 90 percent coverage thresholds wait for the packages they apply to.

**Known risk.** Task 1 step 6 may find coverage below 80 percent on the current small codebase. The plan's instruction is to write tests up to the floor, not to lower it. If that turns out to need more than a handful of tests, stop and raise it rather than quietly widening `coverage.exclude`.

**Ordering constraint.** Task 4 step 5 must ship before Task 8 step 5, or the scanner rejects `research.md`. The tasks are already in that order; do not reorder them.

**A note on the fixtures in this document.** Several test fixtures here are assembled with `.join('@')` rather than written as literal addresses. That is not style. This repository scans every file it tracks, including this plan, and a literal address in it fails `npm run scan:source` before any of this code is written. The destination test file is on the scanner's exclusion list, so the literals are fine once moved there.
