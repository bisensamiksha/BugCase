/**
 * Theming + print E2E (S4-25).
 *
 * Runs against the self-contained `report.html` opened over `file://` — the offline artefact people
 * actually read and print, and the harshest environment for the theme controller, since a `file://`
 * origin may deny storage entirely.
 *
 * Runs in both the chromium and firefox projects (no extension is loaded — it's a static page), so
 * the print layout and the theme toggle are both checked cross-browser.
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
  report = writeReportHtml(tempDir, 'theming-report.html', await extractReportHtmlFromRealZip());
});

test.afterAll(() => {
  removeReportHtmlTempDir(tempDir);
});

const themeAttr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

/** Whether this origin grants localStorage at all — `file://` may not. */
const storageWorks = (page: Page) =>
  page.evaluate(() => {
    try {
      window.localStorage.setItem('bugcase.probe', '1');
      window.localStorage.removeItem('bugcase.probe');
      return true;
    } catch {
      return false;
    }
  });

test.describe('theme toggle', () => {
  test('resolves a concrete theme on load, never "system"', async ({ page }) => {
    await page.goto(report.url);
    await expect(page.getByTestId('theme-toggle')).toBeVisible();

    // The controller must always write a resolved value — that is what keeps the token blocks,
    // Tailwind's dark: variants and the Shiki flip keyed off one signal.
    expect(['light', 'dark']).toContain(await themeAttr(page));
  });

  test('applies the chosen theme to the rendered page, not just the attribute', async ({
    page,
  }) => {
    await page.goto(report.url);

    // The top bar paints with bg-[var(--bc-surface)]; body itself is transparent, so measuring it
    // would prove nothing about whether the tokens reach the UI.
    const background = () =>
      page.getByTestId('app-topbar').evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.getByTestId('theme-light').click();
    await expect.poll(() => themeAttr(page)).toBe('light');
    const light = await background();

    await page.getByTestId('theme-dark').click();
    await expect.poll(() => themeAttr(page)).toBe('dark');
    const dark = await background();

    // Proves the tokens are actually wired to the attribute, not merely that the attribute flipped.
    expect(dark).not.toBe(light);
  });

  test('marks the active choice for assistive technology', async ({ page }) => {
    await page.goto(report.url);

    await page.getByTestId('theme-dark').click();
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-pressed', 'false');
  });

  test('survives a reload where storage is available, and stays usable where it is not', async ({
    page,
  }) => {
    await page.goto(report.url);
    await page.getByTestId('theme-dark').click();
    await expect.poll(() => themeAttr(page)).toBe('dark');

    const persists = await storageWorks(page);
    await page.reload();
    await expect(page.getByTestId('theme-toggle')).toBeVisible();

    if (persists) {
      await expect.poll(() => themeAttr(page)).toBe('dark');
      await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true');
    } else {
      // Storage denied: the choice is forgotten, but the page must still resolve a theme and the
      // toggle must still work rather than throwing on load.
      expect(['light', 'dark']).toContain(await themeAttr(page));
      await page.getByTestId('theme-dark').click();
      await expect.poll(() => themeAttr(page)).toBe('dark');
    }
  });
});

test.describe('print layout', () => {
  test('drops the shell chrome and reveals the report header', async ({ page }) => {
    await page.goto(report.url);
    await expect(page.getByTestId('app-sidenav')).toBeVisible();
    await expect(page.getByTestId('print-header')).toBeHidden();

    await page.emulateMedia({ media: 'print' });

    await expect(page.getByTestId('app-sidenav')).toBeHidden();
    await expect(page.getByTestId('app-topbar')).toBeHidden();
    await expect(page.getByTestId('legal-footer')).toBeHidden();
    await expect(page.getByTestId('theme-toggle')).toBeHidden();
    // Without this the printed PDF says nothing about which capture produced it.
    await expect(page.getByTestId('print-header')).toBeVisible();
  });

  test('prints light even when the reader chose dark', async ({ page }) => {
    await page.goto(report.url);
    await page.getByTestId('theme-dark').click();
    await expect.poll(() => themeAttr(page)).toBe('dark');

    await page.emulateMedia({ media: 'print' });

    // The resolved attribute stays dark; the print block overrides the values it resolves to.
    const printed = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bc-bg').trim(),
    );
    expect(printed).toBe('#ffffff');
  });

  test('identifies the capture in the printed header', async ({ page }) => {
    await page.goto(report.url);
    await page.emulateMedia({ media: 'print' });

    const header = page.getByTestId('print-header');
    await expect(header).toBeVisible();
    await expect(header).toContainText('BugCase report');
    // The fixture's captured page URL — the whole point of the header.
    await expect(header).toContainText('http');
  });
});
