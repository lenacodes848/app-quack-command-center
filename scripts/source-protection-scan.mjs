import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES = [
  {
    rule: 'home-directory-path',
    pattern: new RegExp(['(?:^|[\\s"\'`(=:])', '(?:/Users/|/home/)', '[A-Za-z0-9._-]+/'].join('')),
  },
  {
    rule: 'email-address',
    pattern:
      /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
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
      for (const { rule, pattern } of RULES) {
        if (pattern.test(text)) findings.push({ file, line: i + 1, rule });
      }
      const lower = text.toLowerCase();
      for (const d of deny) {
        if (lower.includes(d)) findings.push({ file, line: i + 1, rule: 'deny-list' });
      }
    });
  }
  return findings;
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
  const findings = scanFiles(rootDir, trackedFiles(rootDir), denylist);
  if (findings.length > 0) {
    for (const f of findings) console.error(`${f.file}:${f.line}  ${f.rule}`);
    console.error(
      `source protection scan FAILED: ${findings.length} finding(s). Matched text is not printed.`,
    );
    process.exit(1);
  }
  console.log(`source protection scan passed (${denylist.length} deny-list entries)`);
}
