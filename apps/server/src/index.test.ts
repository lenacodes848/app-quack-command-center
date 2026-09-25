import { expect, test } from 'vitest';
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
