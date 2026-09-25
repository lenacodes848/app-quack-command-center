import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANSI = /\x1b\[[0-9;]*m/g;

export function commitsScanned(output) {
  const match = output.replace(ANSI, '').match(/\b(\d+) commits? scanned/);
  return match ? Number(match[1]) : 0;
}

function runGitleaks(cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('gitleaks', ['git', '.', '--no-banner', '--redact'], { cwd });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        output += String(chunk);
        process.stdout.write(chunk);
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({ code, output });
    });
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { code, output } = await runGitleaks(process.cwd());
  if (code !== 0) process.exit(code ?? 1);
  if (commitsScanned(output) === 0) {
    console.error(
      'gitleaks scanned zero commits, so this result says nothing about the history. Failing on purpose.',
    );
    process.exit(1);
  }
}
