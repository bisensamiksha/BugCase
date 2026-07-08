import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/** The visual-regression spec is opt-in (see below); everything else ignores it. */
const VISUAL_SPEC = /preview-visual\.spec\.ts/;

/**
 * Visual regression is gated behind `PWTEST_VISUAL` (S3-17). Its `toHaveScreenshot` baselines are
 * platform-suffixed and can only be generated on the platform they run on; CI runs on ubuntu while the
 * committed baselines are darwin (Docker isn't available to produce Linux baselines here). Keeping the
 * `visual` project out of the default run means `pnpm test:e2e` — and CI — stay green regardless of
 * platform. Run it locally with `pnpm test:e2e:visual` (see tests/e2e/__screenshots__/README.md).
 */
const visualEnabled = !!process.env.PWTEST_VISUAL;

/**
 * E2E harness for the BugCase extension (S1-19).
 *
 * - `chromium`: loads the unpacked extension and drives the real capture → ZIP → download
 *   pipeline. Playwright can load unpacked MV3 extensions only in Chromium.
 * - `firefox`: Playwright cannot load MV3 extensions in Firefox, so this project asserts the
 *   produced artifact is consumable in Gecko (the dashboard's runtime) — a report ZIP whose
 *   `metadata.json` unzips and `JSON.parse`s. Firefox extension-runtime checks use `web-ext`.
 * - `visual` (opt-in): loads the standalone preview harness and snapshots preview-screen states.
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
  // Keep visual baselines under tests/e2e/__screenshots__/, suffixed per project + platform (S3-17).
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFileName}/{arg}{-projectName}{-platform}{ext}',
  expect: {
    // Disable animations + tolerate sub-pixel anti-aliasing without hiding real regressions.
    toHaveScreenshot: { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.02 },
  },
  projects: [
    { name: 'chromium', testIgnore: VISUAL_SPEC, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: VISUAL_SPEC, use: { ...devices['Desktop Firefox'] } },
    ...(visualEnabled
      ? [
          {
            name: 'visual',
            testMatch: VISUAL_SPEC,
            // Pin locale + timezone so any formatted text renders identically across machines.
            use: { ...devices['Desktop Chrome'], locale: 'en-US', timezoneId: 'UTC' },
          },
        ]
      : []),
  ],
});
