import { describe, expect, test } from 'vitest';
import { ConfigError, loadServerEnv } from './env.js';

const valid = { DATA_DIR: '/var/lib/quack' };

function catchConfigError(raw: Record<string, string | undefined>): ConfigError {
  try {
    loadServerEnv(raw);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadServerEnv to throw');
}

describe('loadServerEnv', () => {
  test('applies safe defaults and binds to loopback', () => {
    expect(loadServerEnv(valid)).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 4317,
      DATA_DIR: '/var/lib/quack',
      LOG_LEVEL: 'info',
    });
  });

  test('accepts explicit loopback hosts', () => {
    for (const HOST of ['127.0.0.1', '::1', 'localhost']) {
      expect(loadServerEnv({ ...valid, HOST }).HOST).toBe(HOST);
    }
  });

  test('rejects a non-loopback host and explains why', () => {
    const err = catchConfigError({ ...valid, HOST: '0.0.0.0' });
    expect(err.problems.join('\n')).toMatch(/HOST.*loopback.*tunnel/i);
  });

  test('requires DATA_DIR and says how to set it', () => {
    const err = catchConfigError({});
    expect(err.problems.join('\n')).toMatch(/DATA_DIR.*required.*absolute/i);
  });

  test('rejects a relative DATA_DIR', () => {
    expect(catchConfigError({ DATA_DIR: 'data' }).problems.join('\n')).toMatch(
      /DATA_DIR.*absolute/i,
    );
  });

  test('rejects a non-numeric or out-of-range PORT', () => {
    expect(catchConfigError({ ...valid, PORT: 'abc' }).problems.join('\n')).toMatch(
      /PORT.*1024.*65535/,
    );
    expect(catchConfigError({ ...valid, PORT: '80' }).problems.join('\n')).toMatch(
      /PORT.*1024.*65535/,
    );
  });

  test('rejects an unknown NODE_ENV or LOG_LEVEL', () => {
    expect(catchConfigError({ ...valid, NODE_ENV: 'staging' }).problems.join('\n')).toMatch(
      /NODE_ENV/,
    );
    expect(catchConfigError({ ...valid, LOG_LEVEL: 'loud' }).problems.join('\n')).toMatch(
      /LOG_LEVEL/,
    );
  });

  test('reports every problem at once', () => {
    const err = catchConfigError({ HOST: '0.0.0.0', PORT: 'x' });
    expect(err.problems).toHaveLength(3);
  });

  test('never echoes a supplied value in the message', () => {
    const err = catchConfigError({
      DATA_DIR: 'relative-secret-value',
      HOST: 'evil-host-value',
      PORT: 'port-secret-value',
    });
    expect(err.message).not.toMatch(/relative-secret-value|evil-host-value|port-secret-value/);
  });
});
