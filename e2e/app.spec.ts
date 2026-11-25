import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

test.describe('home', () => {
  test('loads with a heading and a way back to levuche.com', async ({
    page,
  }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Go to levuche.com' })
    ).toHaveAttribute('href', 'https://levuche.com');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`has no accessibility problems in ${scheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-lv', scheme);
      await expectNoA11yViolations(page);
    });
  }
});

test('an unknown page shows the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Page not found' })
  ).toBeVisible();
  await expectNoA11yViolations(page);
});

test('stays out of search engines and sends the security headers', async ({
  request,
}) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();

  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toMatch(/Disallow: \/\s*$/m);
});

test('the health check answers', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(response.headers()['cache-control']).toContain('no-store');
});
