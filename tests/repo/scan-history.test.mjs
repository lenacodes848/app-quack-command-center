import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitsScanned } from '../../scripts/scan-history.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(root, 'scripts', 'scan-history.mjs');

const hasGitleaks = spawnSync('gitleaks', ['version']).status === 0;
// Locally a missing gitleaks skips these tests. In CI a missing gitleaks must fail them.
const skip = hasGitleaks || Boolean(process.env.CI) ? false : 'gitleaks is not installed';

// Assembled at run time so this file never contains a complete credential-shaped string.
const fakeKey = ['aB3xK9mQ2v', 'L8nR5tY7uW1zC4dF6gH0jS'].join('');
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
};

function repoWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'sh-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: gitEnv, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  if (Object.keys(files).length > 0) {
    git('add', '.');
    git('commit', '-q', '-m', 'add files');
  }
  return dir;
}

function runScript(cwd) {
  const r = spawnSync('node', [script], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('commitsScanned reads the count gitleaks prints, ignoring colour codes', () => {
  assert.equal(commitsScanned('\x1b[90m2:24AM\x1b[0m \x1b[32mINF\x1b[0m 19 commits scanned.'), 19);
  assert.equal(commitsScanned('INF 1 commits scanned.'), 1);
});

test('commitsScanned treats a missing or zero count as zero', () => {
  assert.equal(commitsScanned('INF 0 commits scanned.'), 0);
  assert.equal(commitsScanned('INF scanned ~0 bytes (0) in 25.9ms\nINF no leaks found'), 0);
  assert.equal(commitsScanned(''), 0);
});

test('a clean history passes and reports how many commits it read', { skip }, () => {
  const dir = repoWith({ 'a.txt': 'nothing secret here\n' });
  try {
    const { code, out } = runScript(dir);
    assert.equal(code, 0, out);
    assert.match(out, /1 commits scanned/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a secret committed to history fails the scan', { skip }, () => {
  const dir = repoWith({ 'cfg.js': `export const c = { api_key: "${fakeKey}" };\n` });
  try {
    const { code, out } = runScript(dir);
    assert.notEqual(code, 0, out);
    assert.match(out, /leaks found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanning zero commits fails instead of reporting a meaningless green', { skip }, () => {
  const dir = repoWith({});
  try {
    const { code, out } = runScript(dir);
    assert.notEqual(code, 0, out);
    assert.match(out, /zero commits/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the working tree scan fails on a secret that is not committed yet', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sh-'));
  try {
    writeFileSync(join(dir, 'cfg.js'), `export const c = { api_key: "${fakeKey}" };\n`);
    const r = spawnSync('gitleaks', ['dir', '.', '--no-banner', '--redact'], { cwd: dir });
    assert.notEqual(r.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
