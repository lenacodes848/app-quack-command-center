import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tilde paths (~/...) are deliberately allowed: they name no user. Only absolute
// home directories that include a user name are findings.
const HOME_DIRECTORY = new RegExp(
  ['(?:^|[\\s"\'`(=:])', '(?:/Users/|/home/)', '[A-Za-z0-9._-]+'].join(''),
);

// The SSH remote form (user "git" at a host) is not a personal address.
const EMAIL =
  /([A-Za-z0-9._%+-]+)@(?!example\.(?:com|org|net)\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const RULES = [
  {
    rule: 'home-directory-path',
    matches: (text) => HOME_DIRECTORY.test(text),
  },
  {
    rule: 'email-address',
    matches: (text) =>
      [...text.matchAll(EMAIL)].some((m) => m[1] !== 'git' && !ALLOWED_IDENTITY_EMAIL.test(m[0])),
  },
];

const SELF_EXCLUDED = new Set([
  'scripts/source-protection-scan.mjs',
  'tests/repo/source-protection.test.mjs',
  'package-lock.json',
]);

const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|gz)$/i;

export function loadDenylist(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export function scanFiles(rootDir, files, denylist) {
  const findings = [];
  const deny = denylist.map((d) => d.toLowerCase());
  for (const file of files) {
    if (SELF_EXCLUDED.has(file) || BINARY_EXT.test(file)) continue;
    const full = join(rootDir, file);
    if (!existsSync(full)) continue;
    const lines = readFileSync(full, 'utf8').split('\n');
    lines.forEach((text, i) => {
      for (const { rule, matches } of RULES) {
        if (matches(text)) findings.push({ file, line: i + 1, rule });
      }
      const lower = text.toLowerCase();
      for (const d of deny) {
        if (lower.includes(d)) findings.push({ file, line: i + 1, rule: 'deny-list' });
      }
    });
  }
  return findings;
}

// Commit metadata is not file content, so the file rules do not apply to it. The
// only identities allowed to author a commit here are GitHub's noreply forms.
const ALLOWED_IDENTITY_EMAIL =
  /^(?:[A-Za-z0-9._%+-]+@users\.noreply\.github\.com|noreply@github\.com)$/;

// An email-shaped substring anywhere in a commit-metadata field. Unlike the
// file-content EMAIL rule, this has no example.* exemption and no SSH-remote
// "git" exception: neither applies to who authored a commit, and a personal
// address can land in a NAME field (an ordinary `git config user.name` mistake),
// not only in an email field.
const EMAIL_TOKEN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export function scanIdentities(identities, denylist) {
  const findings = [];
  const deny = denylist.map((d) => d.toLowerCase());
  for (const { commit, field, value, malformed } of identities) {
    if (malformed) {
      findings.push({ file: `commit ${commit}`, line: field, rule: 'malformed-identity' });
      continue;
    }
    const emails = value.match(EMAIL_TOKEN) ?? [];
    if (emails.some((addr) => !ALLOWED_IDENTITY_EMAIL.test(addr))) {
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
  // -z NUL-terminates each commit record instead of relying on a bare newline,
  // which is a more reliable boundary than a character an ident field can contain.
  let out;
  try {
    out = execFileSync('git', ['log', '-z', '--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce', '--all'], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      // Explicit pipes, not inherited stdio: a git failure's stderr can carry
      // raw identities, and inherited stdio prints it to our stderr even when
      // the resulting exception is caught below.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    // Never let git's raw stdout/stderr (which can carry commit identities)
    // reach an uncaught-exception dump. Rethrow a bare message that names no data.
    throw new Error('readIdentities: failed to read commit metadata from git log');
  }
  const identities = [];
  for (const record of out.split('\0').filter(Boolean)) {
    // Unit separator, not comma or space, because it cannot legitimately appear in
    // a name or email — but git does not forbid it, so a record that doesn't split
    // into exactly 5 fields is itself suspicious and must be flagged, not skipped.
    const fields = record.split('\x1f');
    const commit = (fields[0] ?? '').slice(0, 7) || 'unknown';
    if (fields.length !== 5) {
      identities.push({ commit, field: 'record', value: '', malformed: true });
      continue;
    }
    const [, an, ae, cn, ce] = fields;
    identities.push({ commit, field: 'author-name', value: an });
    identities.push({ commit, field: 'author-email', value: ae });
    identities.push({ commit, field: 'committer-name', value: cn });
    identities.push({ commit, field: 'committer-email', value: ce });
  }
  return identities;
}

function trackedFiles(rootDir) {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    },
  );
  return out.split('\0').filter(Boolean);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const denylist = loadDenylist(
    process.env.SOURCE_PROTECTION_DENYLIST ?? join(rootDir, '.source-protection-denylist'),
  );
  const findings = [
    ...scanFiles(rootDir, trackedFiles(rootDir), denylist),
    ...scanIdentities(readIdentities(rootDir), denylist),
  ];
  if (findings.length > 0) {
    for (const f of findings) console.error(`${f.file}:${f.line}  ${f.rule}`);
    console.error(
      `source protection scan FAILED: ${findings.length} finding(s). Matched text is not printed.`,
    );
    process.exit(1);
  }
  console.log(`source protection scan passed (${denylist.length} deny-list entries)`);
}
