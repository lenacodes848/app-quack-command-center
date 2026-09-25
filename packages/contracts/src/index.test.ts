import { expect, test } from 'vitest';
import { PRODUCT_NAME } from './index.js';

test('exposes the owner-approved product name', () => {
  expect(PRODUCT_NAME).toBe('Quack Command Center');
});
