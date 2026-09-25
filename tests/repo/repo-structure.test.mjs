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
  'HANDOFF.md',
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

test('HANDOFF.md gives a new agent state, next steps, gates and working rules', () => {
  const text = read('HANDOFF.md');
  for (const heading of [
    'Read this first',
    'Current state',
    'Decisions already made',
    'Environment',
    'Working method',
    'Owner gates',
    'Next steps',
    'Gotchas and lessons',
    'Open items',
  ]) {
    assert.match(
      text,
      new RegExp(`^##\\s+.*${heading}`, 'm'),
      `HANDOFF.md is missing the "${heading}" section`,
    );
  }
});

test('HANDOFF.md points at the task that plan.md says is current', () => {
  const current = read('plan.md').match(/^Current task:\s*(TASK_\d{3})\s*$/m)?.[1];
  assert.ok(current, 'plan.md has no current task');
  assert.ok(read('HANDOFF.md').includes(current), `HANDOFF.md must mention ${current}`);
});

test('HANDOFF.md links only to files that exist', () => {
  const links = [
    ...read('HANDOFF.md').matchAll(/`((?:[\w.-]+\/)*[\w.-]+\.(?:md|mjs|yml|json))`/g),
  ].map((m) => m[1]);
  const missing = links.filter(
    (p) =>
      !p.includes('*') &&
      !p.startsWith('docs/superpowers/plans/YYYY') &&
      !existsSync(join(root, p)),
  );
  const allowedFuture = new Set([
    '.source-protection-denylist',
    'package-lock.json',
    'tsconfig.base.json',
    'providers.registry.json',
  ]);
  const real = missing.filter(
    (p) =>
      !allowedFuture.has(p) &&
      !/^(apps|packages|config|tests\/(contracts|integration|security|browser))\//.test(p),
  );
  assert.deepEqual(real, [], `HANDOFF.md references missing files: ${real.join(', ')}`);
});

test('progress.md has a dated entry', () => {
  assert.match(read('progress.md'), /^##\s+\d{4}-\d{2}-\d{2}/m);
});

test('a secrets scanner runs in CI', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /gitleaks/i);
});

test('CI grants the gitleaks action the pull-requests scope it needs on pull_request events', () => {
  const wf = read('.github/workflows/secrets.yml');
  const perms = wf.match(/^permissions:\n((?:[ ]{2}[a-z-]+:\s*\w+\n)+)/m);
  assert.ok(perms, 'workflow must declare a permissions block');
  assert.match(perms[1], /^ {2}contents:\s*read$/m);
  assert.match(perms[1], /^ {2}pull-requests:\s*read$/m);
  assert.doesNotMatch(perms[1], /:\s*write/, 'no write scopes: least privilege');
});

test('CI does not ask gitleaks to post PR comments, which would need a write scope', () => {
  assert.match(read('.github/workflows/secrets.yml'), /GITLEAKS_ENABLE_COMMENTS:\s*["']false["']/);
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
