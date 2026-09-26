import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeStartup, start, workspaceDir } from './index.js';

test('describes the loopback address the service will bind', () => {
  expect(
    describeStartup({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 4317,
      DATA_DIR: '/var/lib/quack',
      LOG_LEVEL: 'info',
    }),
  ).toBe('Quack Command Center would listen on http://127.0.0.1:4317 (development)');
});

// The block below covers the CLI bootstrap guard at the bottom of index.ts
// (`if (process.argv[1] !== undefined && import.meta.url === ...)`), which only
// runs when this file is executed as the process entry point (`node index.js`),
// not when it is imported as a library by another test. Vitest never runs a test
// file as the entry point itself, so the guard is unreachable via a plain import.
// These tests fake being the entry point by pointing process.argv[1] at this
// module's own file and re-importing it after vi.resetModules(), which forces
// the top-level guard to re-evaluate against the faked argv.
const ENV_KEYS = ['NODE_ENV', 'HOST', 'PORT', 'DATA_DIR', 'LOG_LEVEL'] as const;
const modulePath = fileURLToPath(new URL('./index.ts', import.meta.url));

describe('CLI bootstrap guard', () => {
  const originalArgv1 = process.argv[1];
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    process.argv[1] = originalArgv1;
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = originalEnv[key];
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // The happy path is no longer covered by importing the module as the entry
  // point. It used to only log a line; it now binds a port and creates the
  // agent workspace, so a direct-import test would leave a real listening
  // server behind with no handle to close it. start() is tested directly
  // below instead, where the server can be shut down.
  test('starts a listening server and creates the agent workspace', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'quack-start-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const server = start({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 45_871,
      DATA_DIR: dataDir,
      LOG_LEVEL: 'info',
    });

    try {
      await new Promise<void>((resolve) => {
        if (server.listening) resolve();
        else server.once('listening', resolve);
      });

      expect(server.listening).toBe(true);
      // The workspace must exist before a turn can run in it.
      expect(existsSync(workspaceDir({ DATA_DIR: dataDir } as never))).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:45871'));
    } finally {
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('explains a port clash instead of crashing with a raw stack trace', async () => {
    // The most likely startup failure by far: the dashboard is already running
    // in another terminal. Without the handler this surfaces as an unhandled
    // 'error' event and a Node stack trace that says nothing useful.
    const dirA = mkdtempSync(join(tmpdir(), 'quack-clash-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'quack-clash-b-'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = (dir: string) =>
      ({
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: 45_873,
        DATA_DIR: dir,
        LOG_LEVEL: 'info',
      }) as const;

    const first = start(env(dirA));
    await new Promise<void>((resolve) => {
      if (first.listening) resolve();
      else first.once('listening', resolve);
    });

    const second = start(env(dirB));
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    try {
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already in use'));
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = 0;
      second.close();
      await new Promise<void>((resolve) =>
        first.close(() => {
          resolve();
        }),
      );
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  test('reports a non-port startup failure with its message, not silently', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'quack-err-'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const server = start({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 45_874,
      DATA_DIR: dir,
      LOG_LEVEL: 'info',
    });
    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.once('listening', resolve);
    });

    try {
      // Anything that is not a port clash must still surface its message
      // rather than dying as an unhandled event.
      server.emit('error', Object.assign(new Error('permission denied'), { code: 'EACCES' }));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = 0;
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('logs the configuration error and exits 1 when run directly with an invalid environment', async () => {
    process.argv[1] = modulePath;
    delete process.env.DATA_DIR;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    vi.resetModules();
    await import('./index.js');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0] as [string];
    expect(message).toContain('DATA_DIR is required');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
