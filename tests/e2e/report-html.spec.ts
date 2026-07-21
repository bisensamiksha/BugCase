/**
 * report.html integration test (S4-16).
 *
 * Proves the S4-14/S4-15 self-contained report.html works end-to-end: the shared kitchen-sink
 * fixture is embedded, packaged into a real ZIP, extracted back out, and opened over `file://` in a
 * headless browser — the exact "download the ZIP, unzip it, double-click report.html offline" path.
 *
 * Runs in both the chromium and firefox projects (no extension is loaded — it's a static page), so
 * this automates the S4-15 manual "open report.html offline in Chrome/Firefox" cross-browser check.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  createReportHtmlTempDir,
  emptyDataReportHtml,
  extractReportHtmlFromRealZip,
  malformedPayloadReportHtml,
  REPORT_HTML_PANES,
  removeReportHtmlTempDir,
  writeReportHtml,
  type TempReportHtml,
} from './helpers/extract-report-html';

let tempDir: string;
let happy: TempReportHtml;
let empty: TempReportHtml;
let malformed: TempReportHtml;

test.beforeAll(async () => {
  tempDir = createReportHtmlTempDir();
  happy = writeReportHtml(tempDir, 'happy-report.html', await extractReportHtmlFromRealZip());
  empty = writeReportHtml(tempDir, 'empty-report.html', emptyDataReportHtml());
  malformed = writeReportHtml(tempDir, 'malformed-report.html', malformedPayloadReportHtml());
});

test.afterAll(() => {
  removeReportHtmlTempDir(tempDir);
});

/**
 * Collect uncaught page errors and any external http(s) requests. Attached before navigation so a
 * request fired during boot can't slip past — the empty external list is the offline/no-telemetry
 * proof the `file://` open makes possible (blob:/data:/file: object URLs are same-document, not egress).
 */
function watchPage(page: Page): { errors: string[]; external: string[] } {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) {
      external.push(request.url());
    }
  });
  return { errors, external };
}

test('extracts report.html from a real ZIP and renders every pane offline', async ({ page }) => {
  const { errors, external } = watchPage(page);
  await page.goto(happy.url, { waitUntil: 'load' });

  // The embedded report auto-opens: a tab is present and the drop UI is not.
  await expect(page.getByTestId('report-tab-bar')).toBeVisible();
  await expect(page.getByTestId('empty')).toHaveCount(0);

  // Navigate to each of the nine panes via the side nav and confirm each pane's root renders.
  for (const { pane, nav, root } of REPORT_HTML_PANES) {
    await page.getByTestId(nav).click();
    await expect(page.getByTestId(root), `pane "${pane}" did not render`).toBeVisible();
  }

  expect(errors, `unexpected page errors: ${errors.join(' | ')}`).toEqual([]);
  expect(external, `unexpected external requests: ${external.join(' | ')}`).toEqual([]);
});

test('shows the drop UI when opened with no embedded report', async ({ page }) => {
  const { errors } = watchPage(page);
  await page.goto(empty.url, { waitUntil: 'load' });

  await expect(page.getByTestId('empty')).toBeVisible();
  await expect(page.getByTestId('report-tab-bar')).toHaveCount(0);
  expect(errors, `unexpected page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('falls back to the drop UI (no crash) when the embedded payload is malformed', async ({
  page,
}) => {
  const { errors } = watchPage(page);
  await page.goto(malformed.url, { waitUntil: 'load' });

  await expect(page.getByTestId('empty')).toBeVisible();
  await expect(page.getByTestId('report-tab-bar')).toHaveCount(0);
  expect(errors, `unexpected page errors: ${errors.join(' | ')}`).toEqual([]);
});
