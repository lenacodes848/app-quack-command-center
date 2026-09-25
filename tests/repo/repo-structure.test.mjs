import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
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

test('progress.md has a dated entry', () => {
  assert.match(read('progress.md'), /^##\s+\d{4}-\d{2}-\d{2}/m);
});

test('a secrets scanner runs in CI', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /gitleaks/i);
});

test('CI keeps the workflow token read-only', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /^permissions:\n {2}contents:\s*read$/m);
  assert.doesNotMatch(wf, /:\s*write\b/, 'no write scopes anywhere: least privilege');
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
