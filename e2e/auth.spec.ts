import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

// Sign-in against the stand-in Buildbase server (e2e/mock-buildbase.mjs),
// which only runs with a local build: skipped on a deployed preview.
test.skip(
  Boolean(process.env.E2E_BASE_URL),
  'needs the stand-in Buildbase server'
);

// The same values are in e2e/mock-buildbase.mjs and e2e/e2e.env.
const COOKIE = 'bb-session-id-testtest';
const SESSION = 'e2e-session';
const signedIn = { name: COOKIE, value: SESSION, url: 'http://localhost:3100' };

test('a signed-out visitor sees only the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Sign in to Levuche' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Make a site' })).toHaveCount(
    0
  );
  await expectNoA11yViolations(page);
});

// The test creator has no sites, so the app sends them on to make one
// (e2e/sites.spec.ts covers sites).
test('signing in comes back to the app', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Make a site' })
  ).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === COOKIE);
  expect(cookie).toMatchObject({ value: SESSION, httpOnly: true });
});

test('a session shows the app and account menu', async ({ page, context }) => {
  await context.addCookies([signedIn]);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Make a site' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Sam Rivera' }).click();
  await expect(page.getByText('sam@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden();
});

test('an ended session shows the sign-in screen', async ({ page, context }) => {
  await context.addCookies([{ ...signedIn, value: 'ended-session' }]);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Sign in to Levuche' })
  ).toBeVisible();
});

test('signing out ends the session', async ({ page, context }) => {
  await context.addCookies([signedIn]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Sam Rivera' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sign in to Levuche' })
  ).toBeVisible();
  expect((await context.cookies()).some((c) => c.name === COOKIE)).toBe(false);
});

// levuche.com reads the same session, so ending it at Buildbase is what
// signs the creator out there too: even a copy of the old cookie that a
// browser kept no longer signs anyone in.
test('signing out ends the session on levuche.com too', async ({
  page,
  context,
}) => {
  const session = `e2e-signout-${Date.now()}-${Math.random()}`;
  const theirs = { ...signedIn, value: session };
  await context.addCookies([theirs]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Sam Rivera' }).click();
  const signedOut = page.waitForResponse('**/api/auth/signout');
  await page.getByRole('button', { name: 'Sign out' }).click();
  // allHeaders: headers() leaves out Set-Cookie.
  const cleared = (await (await signedOut).allHeaders())['set-cookie'] ?? '';
  expect(cleared).toContain(`${COOKIE}=;`);
  expect(cleared).toMatch(/Max-Age=0/i);
  await expect(
    page.getByRole('heading', { name: 'Sign in to Levuche' })
  ).toBeVisible();

  await context.addCookies([theirs]);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Sign in to Levuche' })
  ).toBeVisible();
});

test('another site cannot post to the sign-in routes', async ({ request }) => {
  for (const route of ['token', 'signout']) {
    const response = await request.post(`/api/auth/${route}`, {
      headers: {
        Origin: 'https://evil.example',
        'Sec-Fetch-Site': 'cross-site',
      },
      data: { code: 'anything' },
    });
    expect(response.status(), route).toBe(403);
  }
});

test('a wrong code is refused', async ({ request }) => {
  const response = await request.post('/api/auth/token', {
    headers: { Origin: 'http://localhost:3100' },
    data: { code: 'not-the-code' },
  });
  expect(response.status()).toBe(400);
  expect(response.headers()['set-cookie']).toBeUndefined();
});
