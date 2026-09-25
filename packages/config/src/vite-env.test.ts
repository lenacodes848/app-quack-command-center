import { describe, expect, test } from 'vitest';
import { PUBLIC_ENV_PREFIX, assertNoSecretPublicEnv } from './vite-env.js';
import { ConfigError } from './env.js';

describe('assertNoSecretPublicEnv', () => {
  test('allows harmless public variables and server-only secrets', () => {
    expect(() => {
      assertNoSecretPublicEnv({ VITE_APP_TITLE: 'x', SERVER_TOKEN: 'y' });
    }).not.toThrow();
  });

  test.each([
    'VITE_API_TOKEN',
    'VITE_SECRET',
    'VITE_DB_PASSWORD',
    'VITE_PROVIDER_KEY',
    'VITE_AUTH_CODE',
    'VITE_CREDENTIALS',
  ])('rejects %s', (name) => {
    expect(() => {
      assertNoSecretPublicEnv({ [name]: 'value-that-must-not-leak' });
    }).toThrow(ConfigError);
  });

  test('names the variable but never prints the value', () => {
    let message = '';
    try {
      assertNoSecretPublicEnv({ VITE_API_TOKEN: 'value-that-must-not-leak' });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('VITE_API_TOKEN');
    expect(message).not.toContain('value-that-must-not-leak');
  });

  test('exposes the prefix Vite must use', () => {
    expect(PUBLIC_ENV_PREFIX).toBe('VITE_');
  });
});
