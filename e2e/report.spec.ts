// Reporting a page and pausing a site (#33), against the stand-in Buildbase
// server and a local D1. The staff user is the session "e2e-staff"
// (STAFF_USER_IDS in e2e/e2e.env).
import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

const APP = 'http://localhost:3100';
const MOCK = 'http://localhost:3101';
const COOKIE = 'bb-session-id-testtest';
const STAFF = 'e2e-staff';

test.skip(
  Boolean(process.env.E2E_BASE_URL),
  'Needs the stand-in Buildbase server and a local database.'
);

const newCreator = () => `e2e-${randomUUID()}`;
const newHandle = () => `t-${randomUUID().slice(0, 8)}`;
// Each test reports as its own visitor.
const newVisitor = () =>
  `198.51.100.${Math.floor(Math.random() * 250) + 1}, 10.0.0.${Math.floor(Math.random() * 250) + 1}`;

async function signInAs(page: Page, session: string) {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: COOKIE, value: session, url: APP }]);
}

/** A live site: made, emptied of blocks still to fill in, bought, published. */
async function liveSite(page: Page, request: APIRequestContext, name: string) {
  const handle = newHandle();
  await page.goto('/new');
  await page.getByLabel('Site name').fill(name);
  await page.getByLabel('Address').fill(handle);
  await page.getByRole('button', { name: 'Make the site' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  const id = page.url().split('/sites/')[1];
  await page.goto(`/sites/${id}/edit`);
  for (const block of ['Social icons', 'Links']) {
    await page.getByRole('button', { name: `Remove ${block}` }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.locator('[data-save]')).toHaveText('All changes saved.');
  }
  expect(
    (await request.post(`${MOCK}/e2e/paid`, { data: { workspaceId: id } })).ok()
  ).toBe(true);
  await page.goto(`/sites/${id}/publish`);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText(
    'Version 1 is live.'
  );
  return { id, handle };
}

async function report(
  page: Page,
  handle: string,
  reason: string,
  details = ''
) {
  await page.goto(`/report/${handle}`);
  await page.getByLabel(reason).check();
  if (details) await page.getByLabel('More details (optional)').fill(details);
  await page.getByRole('button', { name: 'Send report' }).click();
  await page.waitForURL(/done=/);
}

test('anyone can report a live page, once a day', async ({ page, request }) => {
  await signInAs(page, newCreator());
  const { handle } = await liveSite(page, request, 'Reported shop');

  // A visitor with no account.
  await page.context().clearCookies();
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': newVisitor() });
  await page.goto(`/report/${handle}?page=`);
  await expect(
    page.getByRole('heading', { name: 'Report a page', level: 1 })
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await report(page, handle, 'Spam or a scam', 'It asks for card numbers.');
  await expect(page.getByRole('status')).toHaveText(
    'Thanks. Your report reached the Levuche team, and we’ll look at it.'
  );
  await report(page, handle, 'Something else');
  await expect(page.getByRole('status')).toHaveText(
    'You’ve already reported this page today. The Levuche team has it.'
  );

  // A page that isn't live has nothing to report.
  await page.goto(`/report/${newHandle()}`);
  await expect(page.getByText('so there’s nothing to report')).toBeVisible();
});

test('the team pauses a reported site, the creator appeals, the team unpauses', async ({
  page,
  request,
}) => {
  const creator = newCreator();
  await signInAs(page, creator);
  const { id, handle } = await liveSite(page, request, 'Paused shop');

  await page.context().clearCookies();
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': newVisitor() });
  await report(
    page,
    handle,
    'Pretending to be someone else',
    'Not their name.'
  );

  // Someone who isn't staff can't open the team's screen.
  await signInAs(page, creator);
  expect((await page.goto('/staff'))?.status()).toBe(404);

  await signInAs(page, STAFF);
  await page.goto('/staff');
  const reported = page.locator(`[data-reported="${handle}"]`);
  await expect(reported).toContainText('Pretending to be someone else');
  await expect(reported).toContainText('Not their name.');
  await expectNoA11yViolations(page);

  // The copy as reported.
  await reported
    .getByRole('link', { name: 'See version 1 as reported' })
    .click();
  await expect(page.locator('[data-block="creator-header"]')).toContainText(
    'Paused shop'
  );
  await page.goBack();

  await reported
    .getByLabel('Note to the creator (optional)')
    .fill('Use your own name.');
  await reported.getByRole('button', { name: `Pause ${handle}` }).click();
  await expect(page.getByRole('status').first()).toHaveText(
    'The site is paused. Its creator sees why.'
  );
  await expect(page.locator(`[data-paused="${handle}"]`)).toBeVisible();
  await expect(page.locator(`[data-reported="${handle}"]`)).toHaveCount(0);

  // The creator sees why, and asks the team to look again.
  await signInAs(page, creator);
  await page.goto(`/sites/${id}`);
  const notice = page.locator('[data-paused-notice]');
  await expect(notice).toContainText('pretending to be someone else');
  await expect(notice).toContainText('Use your own name.');
  await expect(page.locator('[data-status]')).toHaveText('Paused by Levuche');
  await expectNoA11yViolations(page);
  await notice
    .getByLabel(
      'If you think this is a mistake, tell us why and we’ll look again.'
    )
    .fill('It is my stage name.');
  await notice.getByRole('button', { name: 'Ask us to look again' }).click();
  await expect(notice).toContainText('We got your request on');

  await signInAs(page, STAFF);
  await page.goto('/staff');
  const paused = page.locator(`[data-paused="${handle}"]`);
  await expect(paused.locator('[data-appeal]')).toContainText(
    'It is my stage name.'
  );
  await paused.getByRole('button', { name: `Unpause ${handle}` }).click();
  await expect(page.getByRole('status').first()).toHaveText(
    'The site is back as it was before the pause.'
  );
  const log = page.locator('[data-log]');
  await expect(log.filter({ hasText: handle }).first()).toContainText(
    'Unpaused'
  );
  // hasText ignores case, so anchor it: "Unpaused" holds "paused" too.
  await expect(
    log.filter({ hasText: new RegExp(`^Paused ${handle}\\b`) })
  ).toHaveCount(1);

  await signInAs(page, creator);
  await page.goto(`/sites/${id}`);
  await expect(page.locator('[data-status]')).toHaveText('Live, version 1');
});
