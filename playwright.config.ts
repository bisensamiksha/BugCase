import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/**
 * E2E harness for the BugCase extension (S1-19).
 *
 * - `chromium`: loads the unpacked extension and drives the real capture → ZIP → download
 *   pipeline. Playwright can load unpacked MV3 extensions only in Chromium.
 * - `firefox`: Playwright cannot load MV3 extensions in Firefox, so this project asserts the
 *   produced artifact is consumable in Gecko (the dashboard's runtime) — a report ZIP whose
 *   `metadata.json` unzips and `JSON.parse`s. Firefox extension-runtime checks use `web-ext`.
 *
 * The extension test creates its own persistent context, so runs are serialized.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 120_000,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
