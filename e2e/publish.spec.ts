import { randomUUID } from 'node:crypto';
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

// Publishing (#21) against the stand-in Buildbase server and a local D1
// database: skipped on a deployed preview.
test.skip(
  Boolean(process.env.E2E_BASE_URL),
  'needs the stand-in Buildbase server'
);

const COOKIE = 'bb-session-id-testtest';
const APP = 'http://localhost:3100';
const MOCK = 'http://localhost:3101';

const newCreator = () => `e2e-${randomUUID()}`;
const newHandle = () => `t-${randomUUID().slice(0, 8)}`;

async function signInAs(page: Page, session: string) {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: COOKIE, value: session, url: APP }]);
}

async function makeSite(page: Page, name: string, handle = newHandle()) {
  await page.goto('/new');
  await page.getByLabel('Site name').fill(name);
  await page.getByLabel('Address').fill(handle);
  await page.getByRole('button', { name: 'Make the site' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return page.url().split('/sites/')[1];
}

const saved = (page: Page) =>
  expect(page.locator('[data-save]')).toHaveText('All changes saved.');

/** Takes the empty social icons and links off, leaving the profile. */
async function removeEmptyBlocks(page: Page, id: string) {
  await page.goto(`/sites/${id}/edit`);
  for (const name of ['Social icons', 'Links']) {
    await page.getByRole('button', { name: `Remove ${name}` }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await saved(page);
  }
}

/** Marks the site bought (#19) in the stand-in Buildbase, without paying. */
async function markPaid(request: APIRequestContext, id: string) {
  const paid = await request.post(`${MOCK}/e2e/paid`, {
    data: { workspaceId: id },
  });
  expect(paid.ok()).toBe(true);
}

async function publish(page: Page, id: string, note = '') {
  await page.goto(`/sites/${id}/publish`);
  if (note) await page.getByLabel('Note (optional)').fill(note);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  // Wait for the answer, so a test that goes elsewhere next doesn't cut the
  // publish short.
  await page.waitForURL(/[?&]done=/);
}

test('a draft that needs a fix is listed, with a link to the block', async ({
  page,
}) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Not ready');
  await page.getByRole('link', { name: 'Publish' }).click();

  await expect(
    page.getByRole('heading', { name: 'Needs a fix', level: 2 })
  ).toBeVisible();
  await expect(page.locator('[data-needs-fix]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
  await expectNoA11yViolations(page);

  await page.getByRole('link', { name: 'Fix links' }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${id}/edit\\?block=`));
  await expect(
    page.getByRole('heading', { name: 'Links', level: 2 })
  ).toBeVisible();
});

test('a page is bought before it first goes live', async ({ page }) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Paying first');
  await removeEmptyBlocks(page, id);

  await page.goto(`/sites/${id}/publish`);
  const buy = page.locator('[data-buy]');
  await expect(buy).toContainText('Buy your page to publish it');
  await expect(buy).toContainText('$9.00, paid once');
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
  await expectNoA11yViolations(page);

  // Leaving the checkout comes back with nothing bought.
  await page.getByRole('button', { name: 'Buy for $9.00' }).click();
  await expect(page.getByRole('heading', { name: 'Pay $9.00' })).toBeVisible();
  await page.getByRole('link', { name: 'Cancel' }).click();
  await expect(page.getByRole('status').first()).toHaveText(
    'You didn’t finish paying, so nothing was charged.'
  );
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Buy for $9.00' }).click();
  // Wait for the checkout page, so Pay is pressed there and not mid-way.
  await expect(page.getByRole('heading', { name: 'Pay $9.00' })).toBeVisible();
  await page.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${id}/publish\\?done=paid`));
  await expect(page.getByRole('status').first()).toHaveText(
    'Thanks, your page is bought. Publish it whenever you’re ready.'
  );
  await expect(page.locator('[data-buy]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText(
    'Version 1 is live.'
  );
});

test('an editor asks an admin to buy the page', async ({ page, request }) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Editor waits');
  await removeEmptyBlocks(page, id);

  const editor = newCreator();
  const added = await request.post(`${MOCK}/e2e/members`, {
    data: { workspaceId: id, session: editor, role: 'editor' },
  });
  expect(added.ok()).toBe(true);
  await signInAs(page, editor);
  await page.goto(`/sites/${id}/publish`);
  await expect(page.locator('[data-buy]')).toContainText(
    'Ask an admin of this site to buy it.'
  );
  await expect(page.getByRole('button', { name: /^Buy for/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
});

test('publishing makes a version live, and an older one can go live again', async ({
  page,
  request,
}) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Going live');
  await removeEmptyBlocks(page, id);
  await markPaid(request, id);

  await publish(page, id, 'First go');
  await expect(page.getByRole('status').first()).toHaveText(
    'Version 1 is live.'
  );
  const first = page.locator('[data-version="1"]');
  await expect(first).toContainText('Live');
  await expect(first).toContainText('First go');
  await expect(first).toContainText('Published by you');
  await expectNoA11yViolations(page);

  await page.goto(`/sites/${id}`);
  await expect(
    page.getByText('Live, version 1', { exact: true })
  ).toBeVisible();
  await expect(page.locator('[data-draft-changes]')).toHaveCount(0);

  // A change to the draft shows on the overview until it's published.
  await page.goto(`/sites/${id}/edit`);
  await page.getByLabel(/^Name \(needed\)$/).fill('Going live again');
  await saved(page);
  await page.goto(`/sites/${id}`);
  await expect(page.locator('[data-draft-changes]')).toHaveText(
    'Draft has changes'
  );

  await publish(page, id);
  await expect(page.getByRole('status').first()).toHaveText(
    'Version 2 is live.'
  );
  await page.getByRole('button', { name: 'Make version 1 live' }).click();
  await expect(page.getByRole('status').first()).toHaveText(
    'Version 1 is live again.'
  );
  await expect(page.locator('[data-version="1"]')).toContainText('Live');
});

test('the private preview link shows the draft until it is turned off', async ({
  page,
  browser,
}) => {
  await signInAs(page, newCreator());
  const handle = newHandle();
  const id = await makeSite(page, 'Sneak peek', handle);
  await page.goto(`/sites/${id}/publish`);
  await page.getByRole('button', { name: 'Turn on a preview link' }).click();
  const link = page.getByRole('link', { name: /\/draft\// });
  const url = (await link.getAttribute('href')) ?? '';
  expect(url).toMatch(/\/draft\/[0-9a-z]{64}$/);

  // Anyone with the link, signed in or not, sees the draft.
  const visitor = await (await browser.newContext()).newPage();
  const response = await visitor.goto(url);
  expect(response?.status()).toBe(200);
  expect((await response?.allHeaders())?.['x-robots-tag']).toContain('noindex');
  await expect(
    visitor.getByText(`A preview of ${handle}.levuche.page`)
  ).toBeVisible();
  await expect(visitor.locator('[data-block="creator-header"]')).toContainText(
    'Sneak peek'
  );
  await expectNoA11yViolations(visitor);

  await page.getByRole('button', { name: 'Turn off the preview link' }).click();
  await expect(page.getByRole('status').first()).toHaveText(
    'Your preview link is off.'
  );
  expect((await visitor.goto(url))?.status()).toBe(404);
});

test('a viewer sees the versions but cannot publish', async ({
  page,
  request,
}) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Viewer look');
  await removeEmptyBlocks(page, id);
  await markPaid(request, id);
  await publish(page, id);

  const viewer = newCreator();
  const added = await request.post(`${MOCK}/e2e/members`, {
    data: { workspaceId: id, session: viewer, role: 'viewer' },
  });
  expect(added.ok()).toBe(true);
  await signInAs(page, viewer);
  await page.goto(`/sites/${id}/publish`);
  await expect(
    page.getByText('You can look at this site, but not change it.')
  ).toBeVisible();
  await expect(page.locator('[data-version="1"]')).toContainText(
    'Published by'
  );
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
});
