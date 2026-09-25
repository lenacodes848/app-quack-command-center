import { expect, test } from '@playwright/test';

test('the built web app renders the command center shell with a clean console', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));

  const response = await page.goto('/');
  expect(response?.status(), 'the app must be served, not a 404').toBe(200);

  await expect(page).toHaveTitle('Quack Command Center');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quack Command Center');

  expect(problems, 'the page must load without console or page errors').toEqual([]);
});
