import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';

test.describe('home, signed out', () => {
  test('asks to sign in, with a way back to levuche.com', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(401);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to Levuche' })
    ).toBeVisible();
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
  // Cloudflare puts its own `X-Robots-Tag: noindex` on workers.dev preview
  // links in place of the app's, so a pull request preview shows only that.
  // Every other host must send the app's own header.
  if (new URL(response.url()).hostname.endsWith('.workers.dev')) {
    expect(headers['x-robots-tag']).toContain('noindex');
  } else {
    expect(headers['x-robots-tag']).toBe('noindex, nofollow');
  }
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toMatch(/Disallow: \/\s*$/m);
});

test('sends the security policy, report-only off app.levuche.com', async ({
  request,
}) => {
  const headers = (await request.get('/')).headers();
  // Previews, app-dev and the local test build only report.
  expect(headers['content-security-policy']).toBeUndefined();
  const policy = headers['content-security-policy-report-only'] ?? '';
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain('report-uri /api/csp-report');
  expect(headers['reporting-endpoints']).toBe('csp="/api/csp-report"');
});

test('the policy report endpoint takes both report shapes', async ({
  request,
}) => {
  const older = await request.post('/api/csp-report', {
    headers: { 'Content-Type': 'application/csp-report' },
    data: JSON.stringify({
      'csp-report': {
        'document-uri': 'https://app-dev.levuche.com/new?x=1',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example/a.js',
      },
    }),
  });
  expect(older.status()).toBe(204);
  const newer = await request.post('/api/csp-report', {
    headers: { 'Content-Type': 'application/reports+json' },
    data: JSON.stringify([
      {
        type: 'csp-violation',
        body: { effectiveDirective: 'img-src', blockedURL: 'data' },
      },
    ]),
  });
  expect(newer.status()).toBe(204);
  const junk = await request.post('/api/csp-report', { data: 'not json' });
  expect(junk.status()).toBe(204);
});

test('the health check answers', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(response.headers()['cache-control']).toContain('no-store');
});
