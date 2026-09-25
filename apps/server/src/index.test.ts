import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { describeStartup } from './index.js';

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

  test('logs the startup line and does not exit when run directly with a valid environment', async () => {
    process.argv[1] = modulePath;
    process.env.DATA_DIR = '/var/lib/quack';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4317';
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'info';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    vi.resetModules();
    await import('./index.js');

    expect(logSpy).toHaveBeenCalledWith(
      'Quack Command Center would listen on http://127.0.0.1:4317 (development)',
    );
    expect(exitSpy).not.toHaveBeenCalled();
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
