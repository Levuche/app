import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

// The page editor (#20) against the stand-in Buildbase server and a local D1
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

async function makeSite(page: Page, name: string) {
  await page.goto('/new');
  await page.getByLabel('Site name').fill(name);
  await page.getByLabel('Address').fill(newHandle());
  await page.getByRole('button', { name: 'Make the site' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return page.url().split('/sites/')[1];
}

const saved = (page: Page) =>
  expect(page.locator('[data-save]')).toHaveText('All changes saved.');

const blockList = (page: Page) =>
  page
    .locator('[data-editor-block]')
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-editor-block'))
    );

test('a creator fills in their links and sees them in the preview', async ({
  page,
}) => {
  await signInAs(page, newCreator());
  await makeSite(page, 'Riya bakes');
  await page.getByRole('link', { name: 'Edit your page' }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit your page', level: 1 })
  ).toBeVisible();

  // The starting layout: the profile shows, the empty lists ask for links.
  const preview = page.locator('[data-preview-screen]');
  await expect(preview.locator('[data-block="creator-header"]')).toContainText(
    'Riya bakes'
  );
  await expect(preview).toContainText('Add accounts to show this block.');
  await expect(preview).toContainText('Add links to show this block.');
  await expectNoA11yViolations(page);

  // Fill in a link: it shows in the preview and saves by itself.
  await page.getByRole('button', { name: 'Links', exact: true }).click();
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByLabel(/^Title/).fill('Order a cake');
  await page.getByLabel(/^Address/).fill('https://example.com/cakes');
  await expect(
    preview.getByRole('link', { name: /Order a cake/ })
  ).toBeVisible();
  await saved(page);

  // Still there after a reload: it was saved as the draft.
  await page.reload();
  await expect(
    page
      .locator('[data-preview-screen]')
      .getByRole('link', { name: /Order a cake/ })
  ).toBeVisible();

  // The preview takes the width of each screen.
  await page.getByRole('button', { name: 'Computer' }).click();
  await expect(page.locator('[data-preview-screen]')).toHaveAttribute(
    'data-preview-screen',
    'desktop'
  );
});

test('blocks are added, moved and removed', async ({ page }) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Moving blocks');
  await page.goto(`/sites/${id}/edit`);

  await page.getByLabel('Add a block').selectOption({ label: 'Text' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Text', level: 2 })
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: /^Text/ })
    .fill('Fresh bread every **Saturday**.');
  await expect(
    page.locator('[data-preview-screen] [data-block="text-block"]')
  ).toContainText('Fresh bread every Saturday.');
  await saved(page);

  await page.getByRole('button', { name: 'Move Text up' }).click();
  await saved(page);
  expect(await blockList(page)).toEqual([
    'creator-header',
    'social-icons',
    'text-block',
    'link-list',
  ]);

  await page.getByRole('button', { name: 'Remove Social icons' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await saved(page);

  // The new order and the removal were saved.
  await page.reload();
  expect(await blockList(page)).toEqual([
    'creator-header',
    'text-block',
    'link-list',
  ]);
});

test('a viewer sees the page but cannot change it', async ({
  page,
  request,
}) => {
  await signInAs(page, newCreator());
  const id = await makeSite(page, 'Look only');
  const viewer = newCreator();
  const added = await request.post(`${MOCK}/e2e/members`, {
    data: { workspaceId: id, session: viewer, role: 'viewer' },
  });
  expect(added.ok()).toBe(true);

  await signInAs(page, viewer);
  await page.goto(`/sites/${id}`);
  await expect(page.getByRole('link', { name: 'Edit your page' })).toHaveCount(
    0
  );
  await page.goto(`/sites/${id}/edit`);
  await expect(page.locator('[data-save]')).toHaveText(
    'You can look, but not change this page.'
  );
  await expect(page.getByLabel('Add a block')).toHaveCount(0);
  await expect(page.getByLabel(/^Name \(needed\)$/)).toBeDisabled();
});

// A 1×1 PNG, as a camera roll might hand it over.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

test('a creator uploads a profile picture (#24)', async ({ page, request }) => {
  await signInAs(page, newCreator());
  await makeSite(page, 'Asha paints');
  await page.getByRole('link', { name: 'Edit your page' }).click();
  await page
    .locator('[data-editor-block="creator-header"]')
    .getByRole('button')
    .first()
    .click();

  // Something that isn't a picture is turned away in plain words.
  await page.getByLabel('Upload profile picture').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a picture'),
  });
  await expect(
    page.getByRole('status').filter({ hasText: 'JPEG' })
  ).toBeVisible();

  // A picture uploads, fills the field and shows in the preview.
  await page.getByLabel('Upload profile picture').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(
    page.getByRole('status').filter({ hasText: 'Uploaded.' })
  ).toBeVisible();
  const field = page.getByLabel(/^Profile picture/);
  await expect(field).toHaveValue(new RegExp(`^${APP}/files/[0-9a-f-]{36}$`));
  const address = await field.inputValue();
  await saved(page);
  await expect(
    page.locator('[data-preview-screen] img[src*="/files/"]')
  ).toHaveCount(1);

  // The picture is served from the app, kept long and never run as a page.
  const picture = await request.get(address);
  expect(picture.status()).toBe(200);
  expect(picture.headers()['content-type']).toMatch(/^image\/(webp|png|jpeg)$/);
  expect(picture.headers()['content-security-policy']).toContain('sandbox');
  expect(picture.headers()['cache-control']).toContain('immutable');

  // A picture that isn't kept isn't there.
  const missing = await request.get(`${APP}/files/${randomUUID()}`);
  expect(missing.status()).toBe(404);
});
