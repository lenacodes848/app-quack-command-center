import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
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
  // The app reads no environment variable yet, so this alone cannot see exposure.
  // The probe tests below cover that.
  test('the real web bundle contains no server-only value', () => {
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

  test('starts on loopback with a valid environment', async () => {
    // The built server now LISTENS rather than printing a line and exiting, so
    // this cannot use execFileSync: it would block until the server was killed.
    // Spawn it, wait for the startup line, then shut it down.
    const dataDir = mkdtempSync(join(tmpdir(), 'quack-integration-'));
    const child = spawn('node', ['apps/server/dist/index.js'], {
      cwd: root,
      env: { ...nodeEnv, DATA_DIR: dataDir, PORT: '45872' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      const line = await new Promise<string>((resolve, reject) => {
        let seen = '';
        const timer = setTimeout(() => {
          reject(new Error(`server never announced itself; saw: ${seen}`));
        }, 15_000);
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          seen += chunk;
        });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          seen += chunk;
          if (seen.includes('http://127.0.0.1:45872')) {
            clearTimeout(timer);
            resolve(seen);
          }
        });
        child.once('error', reject);
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`server exited early with ${String(code)}; saw: ${seen}`));
        });
      });
      expect(line).toContain('http://127.0.0.1:45872');
    } finally {
      child.kill('SIGKILL');
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('web config environment exposure', () => {
  const probeDir = join(root, 'tests/integration/fixtures/env-probe');
  const webConfig = join(root, 'apps/web/vite.config.ts');

  async function buildProbe(env: Record<string, string>): Promise<string> {
    const outDir = mkdtempSync(join(tmpdir(), 'env-probe-'));
    const saved = Object.keys(env).map((name) => [name, process.env[name]] as const);
    for (const [name, value] of Object.entries(env)) process.env[name] = value;
    try {
      await build({
        root: probeDir,
        configFile: webConfig,
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true },
      });
      return readAll(outDir);
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = value;
      }
      rmSync(outDir, { recursive: true, force: true });
    }
  }

  test('the probe sees a VITE_ variable, so it can detect exposure at all', async () => {
    const bundle = await buildProbe({ VITE_PROBE_VISIBLE: 'visible-value-4c1d' });
    expect(bundle).toContain('visible-value-4c1d');
  });

  test('the real config does not expose a non-VITE_ variable, even to code that reads all of them', async () => {
    const bundle = await buildProbe({
      VITE_PROBE_VISIBLE: 'visible-value-4c1d',
      QUACK_TEST_CANARY: 'canary-e8b2-not-a-real-secret',
    });
    expect(bundle).toContain('visible-value-4c1d');
    expect(bundle).not.toContain('canary-e8b2-not-a-real-secret');
  });
});

describe('rebuilding from a deleted or cleaned state', () => {
  const outputs = [
    'packages/contracts/dist/index.js',
    'packages/config/dist/index.js',
    'apps/server/dist/index.js',
  ];
  const removeDist = () => {
    for (const dir of ['packages/contracts', 'packages/config', 'apps/server', 'apps/web']) {
      rmSync(join(root, dir, 'dist'), { recursive: true, force: true });
    }
  };

  test('rebuilds every package after dist is deleted the obvious way', () => {
    npmRun('build:server');
    removeDist();
    npmRun('build:server');
    for (const file of outputs) expect(existsSync(join(root, file)), file).toBe(true);
  });

  test('npm run clean removes build output and incremental state, and a build after it works', () => {
    npmRun('build:server');
    npmRun('clean');
    for (const file of outputs) expect(existsSync(join(root, file)), file).toBe(false);
    const leftovers = readdirSync(join(root, 'packages'), { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.tsbuildinfo') && !name.includes('node_modules'));
    expect(leftovers).toEqual([]);
    npmRun('build:server');
    for (const file of outputs) expect(existsSync(join(root, file)), file).toBe(true);
  });
});
