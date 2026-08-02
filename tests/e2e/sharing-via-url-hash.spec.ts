/**
 * Sharing via URL hash E2E (S4-26).
 *
 * Runs against the self-contained `report.html` over `file://` — the artefact a link would actually
 * be built from — in both the chromium and firefox projects.
 *
 * The point of the ticket is that a URL reproduces a view. Asserting the hash merely *changes* would
 * not prove that, so every case reloads and checks the rendered result.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  createReportHtmlTempDir,
  extractReportHtmlFromRealZip,
  removeReportHtmlTempDir,
  writeReportHtml,
  type TempReportHtml,
} from './helpers/extract-report-html';

let tempDir: string;
let report: TempReportHtml;

test.beforeAll(async () => {
  tempDir = createReportHtmlTempDir();
  report = writeReportHtml(tempDir, 'sharing-report.html', await extractReportHtmlFromRealZip());
});

test.afterAll(() => {
  removeReportHtmlTempDir(tempDir);
});

const hash = (page: Page) => page.evaluate(() => window.location.hash);

/** Open the console pane of the loaded report. */
async function openConsole(page: Page) {
  await page.goto(report.url);
  await page.getByTestId('nav-console').click();
  await expect(page.getByTestId('console-pane')).toBeVisible();
}

test.describe('filters in the hash', () => {
  test('a typed query lands in the URL and survives a reload', async ({ page }) => {
    await openConsole(page);

    await page.getByTestId('console-search').fill('bugcase');
    await expect.poll(() => hash(page)).toContain('q=bugcase');

    const shared = page.url();
    await page.goto(shared);

    await expect(page.getByTestId('console-search')).toHaveValue('bugcase');
  });

  test('an unfiltered pane keeps a clean URL', async ({ page }) => {
    await openConsole(page);

    // A default view must produce a link worth sharing, not one full of redundant params.
    expect(await hash(page)).not.toContain('?');
  });

  test('clearing a filter takes it back out of the URL', async ({ page }) => {
    await openConsole(page);

    await page.getByTestId('console-search').fill('bugcase');
    await expect.poll(() => hash(page)).toContain('q=bugcase');

    await page.getByTestId('console-search').fill('');
    await expect.poll(() => hash(page)).not.toContain('q=');
  });

  test('filtering does not pile up back-history entries', async ({ page }) => {
    await openConsole(page);
    const before = await page.evaluate(() => window.history.length);

    for (const value of ['b', 'bu', 'bug', 'bugc']) {
      await page.getByTestId('console-search').fill(value);
    }
    await expect.poll(() => hash(page)).toContain('q=bugc');

    // Back belongs to pane navigation, not to keystrokes.
    expect(await page.evaluate(() => window.history.length)).toBe(before);
  });

  test('a hand-written link with a junk filter still renders the report', async ({ page }) => {
    // Attached before navigation so an error thrown during boot cannot slip past (the pattern
    // report-html.spec.ts establishes).
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(report.url);
    const base = page.url().split('#')[0];

    // Someone truncates or mangles a shared link; it must degrade, not break.
    await page.goto(`${base}#/console/does-not-exist?lv=nonsense&since=NaN&q=%E0%A4%A`);

    await expect(page.getByTestId('app-sidenav')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('copy link', () => {
  test('copies a URL that reproduces the current view', async ({ page, context, browserName }) => {
    test.skip(
      browserName === 'firefox',
      'Clipboard read permission is Chromium-only in Playwright',
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await openConsole(page);
    await page.getByTestId('console-search').fill('bugcase');
    await expect.poll(() => hash(page)).toContain('q=bugcase');

    await page.getByTestId('copy-link').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('q=bugcase');

    // The copied link is the deliverable — prove it actually restores the view.
    await page.goto(copied);
    await expect(page.getByTestId('console-search')).toHaveValue('bugcase');
  });

  test('surfaces a clipboard failure instead of failing silently', async ({ page }) => {
    await page.goto(report.url);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () => Promise.reject(new Error('denied')),
        },
        configurable: true,
      });
    });

    await page.getByTestId('copy-link').click();
    await expect(page.getByTestId('copy-link-error')).toBeVisible();
  });
});
