import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

/*
 * The creator page layouts (Levuche/app#4), on the sample page at /preview.
 * The desktop project checks a desktop and, at 820 px wide, a tablet; the
 * phone project checks a phone.
 */

type Box = { x: number; y: number; width: number; height: number };

const PATHS = { beside: '/preview', column: '/preview?layout=column' };

async function boxOf(page: Page, id: string): Promise<Box> {
  const block = page.locator(
    `[data-grid-block="${id}"], [data-page-block="${id}"]`
  );
  await expect(block).toBeVisible();
  const box = await block.boundingBox();
  if (!box) throw new Error(`No box for block ${id}`);
  return box;
}

const right = (box: Box) => box.x + box.width;
const bottom = (box: Box) => box.y + box.height;

const pageWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.clientWidth);

const scrollToEnd = (page: Page) =>
  page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** Every block but the profile sits to the right of it. */
async function expectProfileOnTheLeft(page: Page) {
  const profile = await boxOf(page, 'profile');
  for (const id of ['presets', 'featured', 'video', 'links', 'footer']) {
    expect((await boxOf(page, id)).x).toBeGreaterThanOrEqual(right(profile));
  }
  return profile;
}

test.describe('profile beside the grid, larger screens', () => {
  test.skip(({ isMobile }) => isMobile, 'The phone project checks a phone.');

  test('desktop: profile on the left, stays in view', async ({ page }) => {
    await page.goto(PATHS.beside);
    await expect(page.locator('main[data-frame="beside"]')).toBeVisible();
    const profile = await expectProfileOnTheLeft(page);

    // The grid puts two cards, or two links, side by side.
    const featured = await boxOf(page, 'featured');
    const pack = await boxOf(page, 'pack');
    expect(Math.abs(pack.y - featured.y)).toBeLessThan(2);
    expect(pack.x).toBeGreaterThanOrEqual(right(featured));
    const presets = await boxOf(page, 'presets');
    const app = await boxOf(page, 'app');
    expect(Math.abs(app.y - presets.y)).toBeLessThan(2);
    await expectNoSidewaysScroll(page);

    // Far down the page, the profile is still at the top of the window.
    await page.evaluate(() => window.scrollTo(0, 900));
    const profileTop = async () => (await boxOf(page, 'profile')).y;
    await expect.poll(profileTop).toBeLessThan(40);
    const stuck = await boxOf(page, 'profile');
    expect(stuck.y).toBeGreaterThanOrEqual(0);
    expect(stuck.x).toBeCloseTo(profile.x, 0);
  });

  test('tablet: profile on the left, the rest stacked', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(PATHS.beside);
    await expectProfileOnTheLeft(page);

    // One under the other, the same width.
    const presets = await boxOf(page, 'presets');
    const app = await boxOf(page, 'app');
    expect(app.y).toBeGreaterThanOrEqual(bottom(presets));
    expect(app.x).toBeCloseTo(presets.x, 0);
    expect(app.width).toBeCloseTo(presets.width, 0);
    await expectNoSidewaysScroll(page);
  });
});

test.describe('profile beside the grid, phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'The desktop project checks these.');

  test('phone: one column in reading order', async ({ page }) => {
    await page.goto(PATHS.beside);
    const ids = ['profile', 'presets', 'app', 'featured', 'pack', 'video'];
    const boxes: Box[] = [];
    for (const id of ids) boxes.push(await boxOf(page, id));
    boxes.slice(1).forEach((box, index) => {
      const above = boxes[index];
      expect(box.y).toBeGreaterThanOrEqual(bottom(above) - 1);
      expect(box.x).toBeCloseTo(above.x, 0);
      expect(box.width).toBeCloseTo(above.width, 0);
    });
    await expectNoSidewaysScroll(page);
  });
});

test.describe('one column', () => {
  test('keeps every block in one centred column', async ({ page }) => {
    await page.goto(PATHS.column);
    await expect(page.locator('main[data-frame="column"]')).toBeVisible();

    const profile = await boxOf(page, 'profile');
    const presets = await boxOf(page, 'presets');
    const app = await boxOf(page, 'app');
    expect(presets.y).toBeGreaterThanOrEqual(bottom(profile));
    expect(app.y).toBeGreaterThanOrEqual(bottom(presets));
    for (const box of [presets, app]) {
      expect(box.x).toBeCloseTo(profile.x, 0);
      expect(box.width).toBeCloseTo(profile.width, 0);
    }
    // No wider than the page column (576 px), and in the middle.
    expect(profile.width).toBeLessThanOrEqual(577);
    const width = await pageWidth(page);
    expect(Math.abs(profile.x - (width - right(profile)))).toBeLessThan(2);
    await expectNoSidewaysScroll(page);
  });

  test('can be picked from the preview', async ({ page }) => {
    await page.goto(PATHS.beside);
    const nav = page.getByRole('navigation', { name: 'Page layout' });
    const beside = nav.getByRole('link', { name: 'Profile beside the grid' });
    const oneColumn = nav.getByRole('link', { name: 'One column' });
    await expect(beside).toHaveAttribute('aria-current', 'page');

    await oneColumn.click();
    await expect(page).toHaveURL(/\/preview\?layout=column$/);
    await expect(page.locator('main[data-frame="column"]')).toBeVisible();
    await expect(oneColumn).toHaveAttribute('aria-current', 'page');
    await expect(beside).not.toHaveAttribute('aria-current', 'page');
  });
});

test.describe('back to top', () => {
  for (const [layout, path] of Object.entries(PATHS)) {
    test(`scrolls back up (${layout})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      const button = page.getByRole('button', { name: 'Back to top' });
      await expect(button).toHaveCount(0);

      await scrollToEnd(page);
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      await expectNoA11yViolations(page);

      await button.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.locator('main#top')).toBeFocused();
      await expect(button).toHaveCount(0);
    });
  }
});

test.describe('accessibility', () => {
  const pages = [
    ['profile beside the grid', '/preview'],
    ['profile beside the grid, dark creator colours', '/preview?scheme=dark'],
    ['one column', '/preview?layout=column'],
  ] as const;
  for (const [name, path] of pages) {
    test(`has no problems: ${name}`, async ({ page }) => {
      await page.goto(path);
      await expectNoA11yViolations(page);
    });
  }

  test('the preview bar has no problems in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(PATHS.beside);
    await expect(page.locator('html')).toHaveAttribute('data-lv', 'dark');
    await expectNoA11yViolations(page);
  });
});
