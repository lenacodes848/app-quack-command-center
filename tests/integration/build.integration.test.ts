import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function npmRun(script: string, env: Record<string, string> = {}): string {
  return execFileSync('npm', ['run', '-s', script], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function readAll(dir: string): string {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
}

function failureOutput(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    const e = error as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
    return `${String(e.stdout ?? '')}${String(e.stderr ?? '')}${e.message}`;
  }
  throw new Error('expected the command to fail');
}

describe('web build', () => {
  test('never bundles a server-only secret', () => {
    npmRun('build:web', { QUACK_TEST_CANARY: 'canary-7f3a9c41-not-a-real-secret' });
    expect(readAll(join(root, 'apps/web/dist'))).not.toContain('canary-7f3a9c41-not-a-real-secret');
  });

  test('refuses to build when a secret-looking public variable is set', () => {
    const output = failureOutput(() => {
      npmRun('build:web', { VITE_API_TOKEN: 'canary-9d2e-not-a-real-secret' });
    });
    expect(output).toContain('VITE_API_TOKEN');
    expect(output).not.toContain('canary-9d2e-not-a-real-secret');
  });
});

describe('server build', () => {
  const nodeEnv = { PATH: process.env.PATH ?? '' };

  test('builds, then refuses to start without DATA_DIR and says why', () => {
    npmRun('build:server');
    const output = failureOutput(() =>
      execFileSync('node', ['apps/server/dist/index.js'], {
        cwd: root,
        env: nodeEnv,
        stdio: 'pipe',
      }),
    );
    expect(output).toMatch(/DATA_DIR is required/);
  });

  test('starts on loopback with a valid environment', () => {
    const out = execFileSync('node', ['apps/server/dist/index.js'], {
      cwd: root,
      env: { ...nodeEnv, DATA_DIR: '/tmp/quack-integration' },
      encoding: 'utf8',
    });
    expect(out).toContain('http://127.0.0.1:4317');
  });
});
