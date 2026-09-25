import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFiles, loadDenylist } from '../../scripts/source-protection-scan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'sp-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

test('rejects a home directory path', () => {
  const home = ['', 'Users', 'someone', 'work'].join('/');
  const dir = fixture({ 'a.md': `see ${home}/notes\n` });
  try {
    const findings = scanFiles(dir, ['a.md'], []);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'home-directory-path');
    assert.equal(findings[0].line, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects an email address', () => {
  const email = ['someone', 'mail.test'].join('@');
  const dir = fixture({ 'b.md': `contact ${email}\n` });
  try {
    const findings = scanFiles(dir, ['b.md'], []);
    assert.equal(findings[0]?.rule, 'email-address');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('allows reserved example addresses', () => {
  const email = ['owner', 'example.com'].join('@');
  const dir = fixture({ 'c.md': `contact ${email}\n` });
  try {
    assert.deepEqual(scanFiles(dir, ['c.md'], []), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects entries from the local deny list, case insensitively', () => {
  const dir = fixture({ 'd.md': 'the Internal-Host.corp domain\n' });
  try {
    const findings = scanFiles(dir, ['d.md'], ['internal-host.corp']);
    assert.equal(findings[0]?.rule, 'deny-list');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a clean file produces no findings', () => {
  const dir = fixture({ 'e.md': 'Nothing private here.\n' });
  try {
    assert.deepEqual(scanFiles(dir, ['e.md'], []), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadDenylist ignores comments and blank lines and tolerates a missing file', () => {
  const dir = fixture({ '.source-protection-denylist': '# comment\n\nalpha.corp\n  beta  \n' });
  try {
    assert.deepEqual(loadDenylist(join(dir, '.source-protection-denylist')), ['alpha.corp', 'beta']);
    assert.deepEqual(loadDenylist(join(dir, 'missing')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every tracked file in this repository passes the source protection scan', () => {
  const out = execFileSync('node', ['scripts/source-protection-scan.mjs'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /source protection scan passed/i);
});
