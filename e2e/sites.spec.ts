import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

// Sites against the stand-in Buildbase server (e2e/mock-buildbase.mjs) and a
// local D1 database: skipped on a deployed preview.
test.skip(
  Boolean(process.env.E2E_BASE_URL),
  'needs the stand-in Buildbase server'
);

// The same values are in e2e/mock-buildbase.mjs and e2e/e2e.env.
const COOKIE = 'bb-session-id-testtest';
const APP = 'http://localhost:3100';
const MOCK = 'http://localhost:3101';

/** A creator of their own, with no sites yet: any "e2e-" session is one. */
const newCreator = () => `e2e-${randomUUID()}`;
/** An address no other test or earlier run has used. */
const newHandle = () => `t-${randomUUID().slice(0, 8)}`;

async function signInAs(page: Page, session: string) {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: COOKIE, value: session, url: APP }]);
}

/** Fills in /new and makes the site; answers its workspace id. */
async function makeSite(page: Page, name: string, handle = newHandle()) {
  await page.goto('/new');
  await page.getByLabel('Site name').fill(name);
  await page.getByLabel('Address').fill(handle);
  await page.getByRole('button', { name: 'Make the site' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return page.url().split('/sites/')[1];
}

test('a new creator makes a site and lands on it', async ({ page }) => {
  await signInAs(page, newCreator());
  await page.goto('/');
  await expect(page).toHaveURL(/\/new$/);
  await expect(
    page.getByRole('heading', { name: 'Make a site' })
  ).toBeVisible();
  await expectNoA11yViolations(page);

  const handle = newHandle();
  const id = await makeSite(page, "Sam's studio", handle);
  await expect(page.getByText(`${handle}.levuche.page`)).toBeVisible();
  await expect(page.getByText("You're an admin on this site.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Teammates' })).toBeEnabled();
  await expectNoA11yViolations(page);

  // With one site, signing in goes straight to it.
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/sites/${id}$`));
});

test('the address is checked as it is typed', async ({ page }) => {
  const handle = newHandle();
  await signInAs(page, newCreator());
  await makeSite(page, 'First', handle);

  await signInAs(page, newCreator());
  await page.goto('/new');
  const address = page.getByLabel('Address');
  const check = page.getByRole('status').filter({ hasText: /levuche/i });

  await address.fill(newHandle());
  await expect(check).toHaveText(/\.levuche\.page is free\./);

  await address.fill('admin');
  await expect(check).toHaveText('admin is kept for Levuche.');

  await address.fill(handle);
  await expect(check).toHaveText(`${handle}.levuche.page is taken.`);
  await expectNoA11yViolations(page);

  // Picking a suggested name puts it in the box, and it's free.
  await page
    .getByRole('button', { name: `Use ${handle}-page.levuche.page` })
    .click();
  await expect(address).toHaveValue(`${handle}-page`);
  await expect(check).toHaveText(`${handle}-page.levuche.page is free.`);
});

test('a kept-back address is refused when sent', async ({ page }) => {
  await signInAs(page, newCreator());
  await page.goto('/new');
  await page.getByLabel('Site name').fill('Help desk');
  await page.getByLabel('Address').fill('help');
  await page.getByRole('button', { name: 'Make the site' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'help is kept' })
  ).toHaveText('help is kept for Levuche.');
});

test('signed out, the address check answers nothing', async ({ request }) => {
  const response = await request.get('/api/handles?handle=sam');
  expect(response.status()).toBe(401);
});

test("the overview shows the site's status and copies its link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const handle = newHandle();
  await signInAs(page, newCreator());
  await makeSite(page, 'Overview', handle);

  await expect(page.getByText('Not live yet', { exact: true })).toBeVisible();
  await expect(page.getByText(`${handle}.levuche.page`)).toBeVisible();
  // Not live: the address is shown, not linked.
  await expect(
    page.getByRole('link', { name: `${handle}.levuche.page` })
  ).toHaveCount(0);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Copied' })
  ).toHaveText('Copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `https://${handle}.levuche.page`
  );
});

/**
 * Marks a site live in the local database, quicker than filling in its
 * blocks to publish (e2e/publish.spec.ts publishes for real).
 */
function makeLive(handle: string) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--local',
      '--command',
      `UPDATE sites SET status = 'live', live_version = 1 WHERE id = (SELECT site_id FROM handles WHERE handle = '${handle}')`,
    ],
    { env: { ...process.env, CI: '1' }, stdio: 'pipe' }
  );
}

test('an admin takes a live site offline and puts it back', async ({
  page,
}) => {
  const handle = newHandle();
  await signInAs(page, newCreator());
  // Not live yet: nothing to take offline.
  await makeSite(page, 'On and off', handle);
  await expect(page.getByRole('button', { name: 'Take offline' })).toHaveCount(
    0
  );

  makeLive(handle);
  await page.reload();
  await expect(
    page.getByText('Live, version 1', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: `${handle}.levuche.page` })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Take offline' }).click();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: `${handle}.levuche.page` })
  ).toHaveCount(0);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Put back online' }).click();
  await expect(
    page.getByText('Live, version 1', { exact: true })
  ).toBeVisible();
});

test('a taken address is refused and leaves nothing behind', async ({
  page,
}) => {
  const handle = newHandle();
  await signInAs(page, newCreator());
  await makeSite(page, 'First', handle);

  await signInAs(page, newCreator());
  await page.goto('/new');
  await page.getByLabel('Site name').fill('Second');
  await page.getByLabel('Address').fill(handle);
  await page.getByRole('button', { name: 'Make the site' }).click();
  // The form's alert, not Next's route announcer (also an alert).
  await expect(page.getByRole('alert').filter({ hasText: handle })).toHaveText(
    `${handle}.levuche.page is taken. Try another.`
  );
  await expect(page.getByLabel('Site name')).toHaveValue('Second');

  // The workspace made for it was deleted again: still no sites.
  await page.goto('/');
  await expect(page).toHaveURL(/\/new$/);
});

test('a site is not found by anyone outside it', async ({ page }) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Private');

  await signInAs(page, newCreator());
  const response = await page.goto(`/sites/${id}`);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Page not found' })
  ).toBeVisible();
  await expect(page.getByText('Private')).toHaveCount(0);
});

test('a viewer can look at a site but not change it', async ({
  page,
  request,
}) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Shared');

  const viewer = newCreator();
  const added = await request.post(`${MOCK}/e2e/members`, {
    data: { workspaceId: id, session: viewer, role: 'viewer' },
  });
  expect(added.ok()).toBe(true);

  await signInAs(page, viewer);
  await page.goto(`/sites/${id}`);
  await expect(page.getByRole('heading', { name: 'Shared' })).toBeVisible();
  await expect(
    page.getByText(
      "You're a viewer on this site. You can look at it, but not change it."
    )
  ).toBeVisible();
});

test('the switcher moves between sites', async ({ page }) => {
  await signInAs(page, newCreator());
  const first = await makeSite(page, 'Bakery');
  const second = await makeSite(page, 'Bookshop');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your sites' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Bakery/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Bookshop/ })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto(`/sites/${second}`);
  await page.getByRole('button', { name: 'Bookshop' }).click();
  // Buildbase's switcher: the open site, then "Switch to" on each other one.
  const switcher = page.getByRole('dialog');
  await expect(switcher.getByText('Bakery', { exact: true })).toBeVisible();
  await switcher.getByRole('button', { name: 'Switch to' }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${first}$`));
  await expect(page.getByRole('heading', { name: 'Bakery' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bakery' })).toBeVisible();
});
