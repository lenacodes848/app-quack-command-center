import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const REQUIRED_FILES = [
  'discovery.md',
  'research.md',
  'plan.md',
  'progress.md',
  'PERSONAL_AI_COMMAND_CENTER_PRD.md',
  'STUDENT_DECISIONS.md',
  'RELEASE_CHECKLIST.md',
  '.nvmrc',
  '.gitignore',
  '.github/workflows/secrets.yml',
];

test('contains every required project file', () => {
  for (const f of REQUIRED_FILES) {
    assert.ok(existsSync(join(root, f)), `missing required file: ${f}`);
  }
});

test('project memory files are not empty', () => {
  for (const f of ['discovery.md', 'research.md', 'plan.md', 'progress.md']) {
    assert.ok(statSync(join(root, f)).size > 200, `${f} is empty or a stub`);
  }
});

test('discovery.md carries the source separation rule', () => {
  const text = read('discovery.md');
  assert.match(
    text,
    /must not read, import, copy, translate, reconstruct, or paraphrase any private command center source/i,
  );
});

test('discovery.md records host OS, installed providers and the first release definition', () => {
  const text = read('discovery.md');
  assert.match(text, /macOS/);
  assert.match(text, /Claude Code/);
  assert.match(text, /first release/i);
});

test('research.md records installed Node.js and provider versions', () => {
  const text = read('research.md');
  assert.match(text, /Node\.js\s+24\.\d+\.\d+/);
  assert.match(text, /Claude Code\s+\d+\.\d+\.\d+/);
});

test('node version is pinned to the recorded LTS', () => {
  assert.match(read('.nvmrc').trim(), /^24\.\d+\.\d+$/);
});

test('plan.md names exactly one current task', () => {
  const matches = read('plan.md').match(/^Current task:\s*TASK_\d{3}\s*$/gm) ?? [];
  assert.equal(matches.length, 1, 'plan.md must contain exactly one "Current task: TASK_NNN" line');
});

test('plan.md records every task 001 to 034 with a status', () => {
  const text = read('plan.md');
  for (let i = 1; i <= 34; i += 1) {
    const id = `TASK_${String(i).padStart(3, '0')}`;
    assert.match(text, new RegExp(`\\|\\s*${id}\\s*\\|`), `plan.md is missing ${id}`);
  }
});

test('excluded tasks are recorded as not_applicable with a governing decision', () => {
  const text = read('plan.md');
  for (const id of ['TASK_033', 'TASK_034']) {
    const row = text.split('\n').find((l) => l.includes(`| ${id} |`));
    assert.ok(row && row.includes('not_applicable'), `${id} must be not_applicable`);
    assert.match(row, /STUDENT_DECISIONS/, `${id} must cite the governing decision`);
  }
});

test('plan.md records the owner gates and open items that stop the build', () => {
  const text = read('plan.md');
  assert.match(text, /^## Owner gates$/m);
  assert.match(text, /^## Open items$/m);
  for (const gate of [/device pairing design/i, /public hostname/i, /second provider/i, /tmux/i]) {
    assert.match(text, gate, `plan.md owner gates must mention ${String(gate)}`);
  }
});

test('research.md records environment notes and known follow-ups', () => {
  const text = read('research.md');
  assert.match(text, /^## Environment notes$/m);
  assert.match(text, /^## Follow-ups and known gaps$/m);
  assert.match(text, /branch protection/i);
  assert.match(text, /nvm use/);
});

test('no stale reference to a handoff document remains', () => {
  for (const f of ['plan.md', 'research.md', 'discovery.md']) {
    assert.doesNotMatch(read(f), /HANDOFF\.md/, `${f} still references HANDOFF.md`);
  }
});

test('memory files contain no stray literal backslash-n from a scripted edit', () => {
  for (const f of ['discovery.md', 'research.md', 'plan.md', 'progress.md']) {
    assert.doesNotMatch(read(f), /\\n/, `${f} contains a literal backslash-n sequence`);
  }
});

test('progress.md has a dated entry', () => {
  assert.match(read('progress.md'), /^##\s+\d{4}-\d{2}-\d{2}/m);
});

test('a secrets scanner runs in CI', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /gitleaks/i);
});

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
    for (const [, rawRef] of read(file).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)) {
      const ref = rawRef.replace(/^['"]|['"]$/g, '');
      const isPinnable =
        !ref.startsWith('./') && !ref.startsWith('../') && !ref.startsWith('docker://');
      if (!isPinnable) continue;
      assert.match(
        ref,
        /@[0-9a-f]{40}$/,
        `${file} uses ${ref}, which is a moving tag; pin it to a 40-character commit SHA`,
      );
    }
  }
});

test('CI does not use the gitleaks action, whose commit range can be empty', () => {
  assert.doesNotMatch(
    read('.github/workflows/secrets.yml'),
    /gitleaks\/gitleaks-action/,
    'the action scans a commit range that is empty after a merge-commit merge, yet reports success',
  );
});

test('CI installs a pinned gitleaks and verifies its checksum before running it', () => {
  const wf = read('.github/workflows/secrets.yml');
  const version = wf.match(/GITLEAKS_VERSION:\s*(\d+\.\d+\.\d+)/)?.[1];
  assert.ok(version, 'workflow must pin GITLEAKS_VERSION');
  assert.match(wf, /GITLEAKS_LINUX_X64_SHA256:\s*[0-9a-f]{64}\b/);
  assert.match(wf, /sha256sum --check --strict/);
  const recorded = read('research.md').match(/gitleaks (\d+\.\d+\.\d+)/)?.[1];
  assert.equal(version, recorded, 'CI must use the same gitleaks version research.md records');
});

test('CI scans the full working tree and the full history with the local scripts', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /fetch-depth:\s*0/, 'history scan needs the full clone');
  assert.match(wf, /run:\s*npm run scan:secrets$/m);
  assert.match(wf, /run:\s*npm run scan:secrets:history$/m);
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['scan:secrets'], 'gitleaks dir . --no-banner --redact');
  assert.equal(scripts['scan:secrets:history'], 'node scripts/scan-history.mjs');
});

test('the gitleaks install step runs before the tests that need it', () => {
  const wf = read('.github/workflows/secrets.yml');
  const install = wf.indexOf('Install gitleaks');
  const tests = wf.indexOf('npm run test:repo');
  assert.ok(install >= 0, 'workflow must have an "Install gitleaks" step');
  assert.ok(tests >= 0, 'workflow must run npm run test:repo');
  assert.ok(install < tests, 'gitleaks must be installed before the tests that call it');
});

test('CI runs the same npm scripts a developer runs locally', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /run:\s*npm run test:repo/);
  assert.match(wf, /run:\s*npm run scan:source/);
  assert.doesNotMatch(wf, /node --test/, 'call npm run test:repo so CI and local cannot diverge');
});

test('CI push trigger is limited to main so branch pushes do not run twice', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /push:\n\s+branches:\s*\[main\]/);
  assert.match(wf, /pull_request:/);
});

test('local-only files are gitignored', () => {
  const ignore = read('.gitignore');
  for (const entry of ['node_modules', '.env', '.source-protection-denylist']) {
    assert.ok(
      ignore.split('\n').includes(entry) || ignore.includes(`${entry}\n`),
      `.gitignore must list ${entry}`,
    );
  }
});

function timeoutForProject(config, projectName) {
  const nameIndex = config.search(new RegExp(`name:\\s*'${projectName}'`));
  assert.ok(nameIndex >= 0, `a project named ${projectName} must exist`);
  const match = config.slice(nameIndex).match(/testTimeout:\s*([\d_]+)/);
  assert.ok(match, `testTimeout must be set for the ${projectName} project`);
  return Number(match[1].replace(/_/g, ''));
}

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

  const unitTimeout = timeoutForProject(config, 'unit');
  const integrationTimeout = timeoutForProject(config, 'integration');
  assert.ok(
    unitTimeout <= 10_000,
    `unit project testTimeout must be at most 10000, found ${unitTimeout}`,
  );
  assert.ok(
    integrationTimeout >= 60_000,
    `integration project testTimeout must be at least 60000, found ${integrationTimeout}`,
  );
  assert.notEqual(
    unitTimeout,
    integrationTimeout,
    'unit and integration testTimeout values must differ',
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

const VALIDATE_STEPS = [
  'format:check',
  'lint',
  'typecheck',
  'test:repo',
  'test:coverage',
  'test:integration',
  'build',
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
      new RegExp(`\\bnpm run ${step}\\b`),
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
});

const STEP_PATTERN = /npm run [\w:-]+/g;

function validateSteps(validate) {
  return [...validate.matchAll(STEP_PATTERN)];
}

test('validate joins every step with &&, so an early failure stops the run', () => {
  const validate = JSON.parse(read('package.json')).scripts.validate;
  const steps = validateSteps(validate);
  assert.equal(
    steps.length,
    VALIDATE_STEPS.length,
    `validate must contain exactly ${VALIDATE_STEPS.length} npm run steps, found ${steps.length}`,
  );
  for (let i = 0; i < steps.length - 1; i += 1) {
    const between = validate.slice(steps[i].index + steps[i][0].length, steps[i + 1].index).trim();
    assert.equal(
      between,
      '&&',
      `"${steps[i][0]}" and "${steps[i + 1][0]}" must be joined by exactly &&, found "${between}" instead: ` +
        'any other operator (such as ; or & or ||) lets an earlier failure continue instead of stopping the run, ' +
        'silently reporting later steps as green even though an earlier one failed',
    );
  }
});

test('validate has no content before the first step or after the last step', () => {
  const validate = JSON.parse(read('package.json')).scripts.validate;
  const steps = validateSteps(validate);
  const trimmed = validate.trim();
  const first = steps[0][0];
  const last = steps[steps.length - 1][0];
  assert.ok(
    trimmed.startsWith(first),
    `validate must begin with its first step ("${first}"), with nothing before it: a leading command ` +
      'would run outside the && chain, so its failure could never stop the chain',
  );
  assert.ok(
    trimmed.endsWith(last),
    `validate must end with its last step ("${last}"), with nothing after it: a trailing command ` +
      'would run outside the && chain, so it would run even after every real step, and the run could ' +
      'still exit 0 no matter what it does',
  );
});

test('validate runs build immediately before test:e2e, joined by exactly &&, with nothing else between them', () => {
  const validate = JSON.parse(read('package.json')).scripts.validate;
  const steps = validateSteps(validate);
  const buildIndex = steps.findIndex((m) => m[0] === 'npm run build');
  const e2eIndex = steps.findIndex((m) => m[0] === 'npm run test:e2e');
  assert.ok(buildIndex >= 0, 'validate must run build');
  assert.ok(e2eIndex >= 0, 'validate must run test:e2e');
  assert.equal(
    e2eIndex,
    buildIndex + 1,
    'build must be the step immediately before test:e2e, with no other npm-run step between them',
  );
  const between = validate
    .slice(steps[buildIndex].index + steps[buildIndex][0].length, steps[e2eIndex].index)
    .trim();
  assert.equal(
    between,
    '&&',
    'build and test:e2e must be joined by exactly && with nothing else between them: any command in ' +
      'between (not just another npm-run step, e.g. a bare `rm -rf apps/web/dist` or a raw ' +
      '`npx vitest run --project integration`) can still delete apps/web/dist and leave the browser test ' +
      'with nothing to serve',
  );
});

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
  assert.match(
    wf,
    /if:\s*\$\{\{\s*(?:!\s*cancelled\(\)|always\(\))\s*\}\}/,
    'artifacts must upload even on failure',
  );
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
