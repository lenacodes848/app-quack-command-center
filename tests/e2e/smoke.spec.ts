import { expect, test } from '@playwright/test';

/**
 * The built app is served by `vite preview`, with no dashboard server behind it,
 * so the API is stubbed here. Without a stub the page's own request for the
 * saved conversations answers 404 and the browser logs it as a console error,
 * which this test would report as a failure — correctly, since a real user would
 * see the same thing. Stubbing it instead means the sidebar is exercised against
 * a known response rather than merely tolerated.
 */
const SAVED_SESSIONS = {
  sessions: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      title: 'Yesterday, the adapter',
      model: 'claude-opus-5-5',
      createdAt: '2026-09-24T09:00:00.000Z',
      updatedAt: '2026-09-24T10:00:00.000Z',
    },
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      title: 'An older question',
      model: null,
      createdAt: '2026-09-23T09:00:00.000Z',
      updatedAt: '2026-09-23T09:30:00.000Z',
    },
  ],
};

test('the built web app renders the command center shell with a clean console', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));

  await page.route('**/api/sessions', (route) =>
    route.fulfill({ json: SAVED_SESSIONS, headers: { 'content-type': 'application/json' } }),
  );

  const response = await page.goto('/');
  expect(response?.status(), 'the app must be served, not a 404').toBe(200);

  await expect(page).toHaveTitle('Quack Command Center');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quack Command Center');

  // The saved conversations reach the screen. This is the part a restart depends
  // on, so a shell that renders without them is not actually working.
  const sidebar = page.getByRole('navigation', { name: 'Saved conversations' });
  await expect(sidebar.getByRole('button')).toHaveCount(2);
  await expect(sidebar.getByRole('button').first()).toContainText('Yesterday, the adapter');

  expect(problems, 'the page must load without console or page errors').toEqual([]);
});
