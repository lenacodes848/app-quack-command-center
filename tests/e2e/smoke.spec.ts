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

/** Watch for anything the browser complains about, including CSP violations. */
function watchConsole(page: import('@playwright/test').Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  return problems;
}

test('an unpaired browser is shown the pairing screen, not the dashboard', async ({ page }) => {
  // The security property, seen from the outside: without a session the page
  // offers a login box and no conversation.
  const problems = watchConsole(page);
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Not paired.' } }),
  );

  await page.goto('/');

  await expect(page.getByLabel('Pairing code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pair this device' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Saved conversations' })).toHaveCount(0);

  // The browser logs every non-2xx fetch as a console error, and the 401 here is
  // the correct answer to an unpaired browser asking who it is. Anything else —
  // a script error, a content-security-policy violation — still fails.
  const unexpected = problems.filter((problem) => !problem.includes('401'));
  expect(unexpected, 'the pairing screen must load cleanly').toEqual([]);
});

test('a 421 shows the server explanation, not "is the server running?"', async ({ page }) => {
  // The blocker from the review of #36, end to end in a real browser. The server
  // answers 421 with a specific explanation; the screen used to classify that as
  // 'unavailable' and render "Could not reach the server. Is it still running?"
  // — advice pointing the wrong way, about a server that had just answered.
  const problems = watchConsole(page);
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Not paired.' } }),
  );
  await page.route('**/api/pair', (route) =>
    route.fulfill({
      status: 421,
      json: { error: 'This address cannot keep the session cookie. Open a 127.0.0.1 address.' },
    }),
  );

  await page.goto('/');
  await page.getByLabel('Pairing code').fill('7H2K-9QMR-4B');
  await page.getByRole('button', { name: 'Pair this device' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('cannot keep the session cookie');
  await expect(alert).toContainText('127.0.0.1');
  await expect(alert).not.toContainText('Is it still running?');

  // Still on the pairing screen, and the field is still usable.
  await expect(page.getByRole('button', { name: 'Pair this device' })).toBeEnabled();
  expect(problems.filter((p) => !p.includes('401') && !p.includes('421'))).toEqual([]);
});

test('the built web app renders the command center shell with a clean console', async ({
  page,
}) => {
  const problems = watchConsole(page);

  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { paired: true, device: 'Mac', persistent: true } }),
  );
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
