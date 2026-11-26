import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (e2e/). Two ways to run them:
 *
 * - Against a local production build: `npm run e2e:build`, then `npm run e2e`.
 *   Playwright starts `next start` on port 3100 itself, with sign-in pointed
 *   at a stand-in Buildbase server on port 3101 (e2e/mock-buildbase.mjs and
 *   e2e/e2e.env), so signed-in pages are tested without real accounts.
 * - Against a deployed site, such as a pull request's preview link:
 *   `E2E_BASE_URL=https://pr-12-levuche-app-dev.levuche-com.workers.dev npm run e2e`.
 *   Nothing is started locally then, and the tests that need the stand-in
 *   server are skipped.
 */
const baseURL = process.env.E2E_BASE_URL?.replace(/\/+$/, '');
const port = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  use: {
    baseURL: baseURL ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: baseURL
    ? undefined
    : [
        {
          command: 'node e2e/mock-buildbase.mjs',
          url: 'http://localhost:3101/health',
          reuseExistingServer: !process.env.CI,
        },
        {
          command: `set -a && . ./e2e/e2e.env && set +a && npx next start -p ${port}`,
          url: `http://localhost:${port}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
