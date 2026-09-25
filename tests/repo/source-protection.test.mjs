import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanFiles,
  loadDenylist,
  scanIdentities,
  readIdentities,
} from '../../scripts/source-protection-scan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const denylistPath = join(root, '.source-protection-denylist');

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
    assert.deepEqual(loadDenylist(join(dir, '.source-protection-denylist')), [
      'alpha.corp',
      'beta',
    ]);
    assert.deepEqual(loadDenylist(join(dir, 'missing')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scanText(content, name = 'probe.md') {
  const dir = fixture({ [name]: content });
  try {
    return scanFiles(dir, [name], []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('allows SSH-style git remotes, which are not personal addresses', () => {
  assert.deepEqual(scanText('clone: git@github.com:owner/repo.git\n'), []);
  assert.deepEqual(scanText('url: git+ssh://git@github.com/owner/repo.git\n'), []);
});

test('a package.json repository field with an SSH remote passes the scan', () => {
  const manifest = JSON.stringify(
    { name: 'x', repository: { type: 'git', url: 'git+ssh://git@github.com/owner/repo.git' } },
    null,
    2,
  );
  assert.deepEqual(scanText(`${manifest}\n`, 'package.json'), []);
});

test('still rejects personal addresses whose local part only resembles git', () => {
  for (const local of ['mygit', 'git.person', 'digit', 'git2']) {
    const findings = scanText(`contact ${[local, 'mail.test'].join('@')}\n`);
    assert.equal(findings[0]?.rule, 'email-address', `${local} should be flagged`);
  }
});

test('flags an absolute home directory path with no trailing slash', () => {
  const home = ['', 'Users', 'someone'].join('/');
  assert.equal(scanText(`my home is ${home}\n`)[0]?.rule, 'home-directory-path');
  assert.equal(scanText(`see ${home}.\n`)[0]?.rule, 'home-directory-path');
  assert.equal(scanText(`path="${home}"\n`)[0]?.rule, 'home-directory-path');
  const linuxHome = ['', 'home', 'someone'].join('/');
  assert.equal(scanText(`my home is ${linuxHome}\n`)[0]?.rule, 'home-directory-path');
});

test('allows tilde paths, which name no user', () => {
  assert.deepEqual(scanText('projects live in ~/Downloads/1-git\n'), []);
  assert.deepEqual(scanText('config: ~/.config/tool\n'), []);
});

test('does not flag a bare home-directory prefix with no user name', () => {
  assert.deepEqual(scanText(`the ${['', 'Users', ''].join('/')} prefix is macOS\n`), []);
  assert.deepEqual(scanText(`the ${['', 'home', ''].join('/')} directory\n`), []);
});

test('every tracked file in this repository passes the source protection scan', () => {
  const out = execFileSync('node', ['scripts/source-protection-scan.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(out, /source protection scan passed/i);
});

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

test('a malformed identity record is a finding, not silently dropped', () => {
  const findings = scanIdentities(
    [{ commit: 'abc1234', field: 'record', value: '', malformed: true }],
    [],
  );
  assert.deepEqual(findings, [
    { file: 'commit abc1234', line: 'record', rule: 'malformed-identity' },
  ]);
});

test('a personal address in a NAME field is still a finding, not just an email field', () => {
  const findings = scanIdentities(identity('someone@example.com', 'author-name'), []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'identity-email');
});

test('a GitHub noreply address in a NAME field is allowed', () => {
  assert.deepEqual(scanIdentities(identity(NOREPLY_USER, 'committer-name'), []), []);
});

// Builds a real, throwaway git repository so readIdentities is exercised against
// git's actual `-z`/unit-separator output, not a hand-built fixture array.
function identityRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ident-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

function commitWithIdentity(dir, env) {
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'x'], {
    cwd: dir,
    env: { ...process.env, ...env },
  });
}

test('a unit separator embedded in an author name is a malformed-identity finding, not a silent field shift', () => {
  const dir = identityRepo();
  try {
    // The real defect: an author NAME containing the field delimiter shifts every
    // later field by one, so a naive 5-way destructure would silently swallow the
    // 6th field (here, a personal address) instead of ever seeing it.
    const nameWithSeparator = ['Bob', 'bot@users.noreply.github.com'].join('\x1f');
    commitWithIdentity(dir, {
      GIT_AUTHOR_NAME: nameWithSeparator,
      GIT_AUTHOR_EMAIL: NOREPLY_USER,
      GIT_COMMITTER_NAME: NOREPLY_BOT,
      GIT_COMMITTER_EMAIL: NOREPLY_BOT,
    });
    const findings = scanIdentities(readIdentities(dir), []);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'malformed-identity');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a personal address used as a real commit author NAME is caught end to end', () => {
  const dir = identityRepo();
  try {
    commitWithIdentity(dir, {
      GIT_AUTHOR_NAME: 'someone@example.com',
      GIT_AUTHOR_EMAIL: NOREPLY_USER,
      GIT_COMMITTER_NAME: NOREPLY_BOT,
      GIT_COMMITTER_EMAIL: NOREPLY_BOT,
    });
    const findings = scanIdentities(readIdentities(dir), []);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'identity-email');
    assert.equal(findings[0].line, 'author-name');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readIdentities fails loudly with a bare message, never printing raw git output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'notgit-'));
  try {
    assert.throws(
      () => readIdentities(dir),
      (err) => {
        assert.equal(err.message, 'readIdentities: failed to read commit metadata from git log');
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the identity scan covers HEAD only, so an unrelated branch cannot fail the build', () => {
  // Pins the fix to a real operational defect. When this scanned `--all`, a
  // stale local branch or a leftover refs/remotes/pr/* produced a finding with
  // no relationship to the code under review — and because findings never
  // print matched text, the message was near-undiagnosable. `--all` is exactly
  // the change someone makes in good faith believing it is more thorough,
  // which is how it got there the first time.
  const dir = identityRepo();
  try {
    commitWithIdentity(dir, {
      GIT_AUTHOR_NAME: 'Clean',
      GIT_AUTHOR_EMAIL: NOREPLY_USER,
      GIT_COMMITTER_NAME: 'Clean',
      GIT_COMMITTER_EMAIL: NOREPLY_USER,
    });

    // A personal address on a branch that is NOT checked out.
    execFileSync('git', ['checkout', '-q', '-b', 'stale'], { cwd: dir });
    commitWithIdentity(dir, {
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: ['ada', 'example.com'].join('@'),
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: ['ada', 'example.com'].join('@'),
    });
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: dir });

    assert.deepEqual(
      scanIdentities(readIdentities(dir), []),
      [],
      'a bad identity on a non-HEAD branch must not fail the scan',
    );

    // And the scope is a choice, not an accident: point it at that branch and
    // the same commit is found. Without this half, a readIdentities that
    // silently returned nothing at all would also pass the assertion above.
    const onStale = scanIdentities(readIdentities(dir, 'stale'), []);
    // Two findings, not one: the address sits in both the author-email and the
    // committer-email field, and every field is checked independently.
    assert.equal(onStale.length, 2, 'the same commit must be found when stale IS the scanned ref');
    assert.deepEqual(onStale.map((f) => f.line).sort(), ['author-email', 'committer-email']);
    assert.ok(onStale.every((f) => f.rule === 'identity-email'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an identity finding names the ref it came from, not just a bare sha', () => {
  // Findings print no matched text by design, so without the ref the reader is
  // left with seven hex characters and no way to tell which history they are in.
  const dir = identityRepo();
  try {
    commitWithIdentity(dir, {
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: ['ada', 'example.com'].join('@'),
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: ['ada', 'example.com'].join('@'),
    });
    const findings = scanIdentities(readIdentities(dir), []);
    assert.ok(findings.length > 0, 'the planted identity must be found');
    assert.match(
      findings[0].file,
      /^commit [0-9a-f]{7} on HEAD$/,
      'the finding must name both the commit and the ref that was scanned',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
