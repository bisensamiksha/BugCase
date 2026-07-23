/**
 * Kitchen-sink report rendering (S4-20).
 *
 * Reuses the one shared S4-16 fixture (`sampleReport` + `sampleAssets`, every pane populated) and the
 * built `report.html`, and goes *beyond* S4-16 — which asserts only that each pane's root mounts — by
 * verifying each pane renders the fixture's **actual data** (console lines, network rows, storage
 * keys, reproduction steps, element inspections, DOM snapshot, and privacy/scrubber evidence). Two
 * complementary surfaces are covered:
 *   1. the fixture-embedded `report.html` (the "double-click report.html offline" path);
 *   2. the standalone dashboard reader, by dropping a freshly-built kitchen-sink ZIP into the empty
 *      `report.html`'s real drop-zone `<input type=file>` (the S4-02 intake path).
 *
 * Runs in both the chromium and firefox projects (static page, no extension). Every test also asserts
 * zero uncaught page errors and zero external http(s) requests — the offline / no-egress proof.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  buildKitchenSinkZipBuffer,
  createReportHtmlTempDir,
  emptyDataReportHtml,
  extractReportHtmlFromRealZip,
  removeReportHtmlTempDir,
  writeReportHtml,
  type TempReportHtml,
} from './helpers/extract-report-html';

let tempDir: string;
let happy: TempReportHtml;
let empty: TempReportHtml;

test.beforeAll(async () => {
  tempDir = createReportHtmlTempDir();
  happy = writeReportHtml(
    tempDir,
    'kitchen-sink-report.html',
    await extractReportHtmlFromRealZip(),
  );
  empty = writeReportHtml(tempDir, 'empty-report.html', emptyDataReportHtml());
});

test.afterAll(() => {
  removeReportHtmlTempDir(tempDir);
});

/** Collect uncaught page errors and any external http(s) requests (the offline / no-egress proof). */
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

/** Navigate to a pane by its side-nav link and wait for its root to render. */
async function openPane(page: Page, nav: string, root: string): Promise<void> {
  await page.getByTestId(nav).click();
  await expect(page.getByTestId(root)).toBeVisible();
}

/**
 * Assert each pane renders the fixture's actual data — not just that its root mounted. Shared by both
 * the embedded-report.html and the dropped-ZIP surfaces so the two paths verify identical content.
 */
async function assertKitchenSinkContent(page: Page): Promise<void> {
  await openPane(page, 'nav-overview', 'overview-pane');
  await expect(page.getByTestId('overview-pane')).toContainText(
    'Login button unresponsive on slow network',
  );
  await expect(page.getByTestId('overview-severity')).toContainText(/major/i);

  await openPane(page, 'nav-screenshots', 'screenshots-pane');
  await expect(page.getByTestId('screenshots-grid')).toBeVisible();
  expect(await page.getByTestId('screenshot-card').count()).toBeGreaterThanOrEqual(2);

  await openPane(page, 'nav-console', 'console-pane');
  expect(await page.getByTestId('console-row').count()).toBe(2);
  await expect(page.getByTestId('console-pane')).toContainText('POST /api/login failed');

  await openPane(page, 'nav-network', 'network-pane');
  expect(await page.getByTestId('network-row').count()).toBe(1);
  await expect(page.getByTestId('network-pane')).toContainText('/api/login');

  await openPane(page, 'nav-dom', 'dom-snapshot-pane');
  await expect(page.getByTestId('dom-preview-frame')).toBeVisible();

  await openPane(page, 'nav-inspections', 'element-inspections-pane');
  await expect(page.getByTestId('inspections-list')).toBeVisible();
  await expect(page.getByTestId('element-inspections-pane')).toContainText(/submit/i);

  await openPane(page, 'nav-reproduction', 'reproduction-pane');
  await expect(page.getByTestId('repro-timeline')).toBeVisible();
  await expect(page.getByTestId('reproduction-pane')).toContainText('Click Submit');

  await openPane(page, 'nav-storage', 'storage-pane');
  await expect(page.getByTestId('storage-pane')).toContainText('theme');
  await expect(page.getByTestId('storage-pane')).toContainText('csrf');

  await openPane(page, 'nav-privacy', 'privacy-pane');
  await expect(page.getByTestId('privacy-scrubber-total')).toContainText('3 values scrubbed');
  await expect(page.getByTestId('privacy-scrubber-total')).toContainText('2 rules');
}

test('embedded report.html renders every pane with the fixture data (offline)', async ({
  page,
}) => {
  const { errors, external } = watchPage(page);
  await page.goto(happy.url, { waitUntil: 'load' });

  await expect(page.getByTestId('report-tab-bar')).toBeVisible();
  await assertKitchenSinkContent(page);

  expect(errors, `unexpected page errors: ${errors.join(' | ')}`).toEqual([]);
  expect(external, `unexpected external requests: ${external.join(' | ')}`).toEqual([]);
});

test('dropping a kitchen-sink ZIP into the empty report renders every pane (offline)', async ({
  page,
}) => {
  const { errors, external } = watchPage(page);
  await page.goto(empty.url, { waitUntil: 'load' });

  // Empty state shows the drop UI; feed the real ZIP into the drop-zone's hidden file input.
  await expect(page.getByTestId('empty')).toBeVisible();
  const zip = await buildKitchenSinkZipBuffer();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'bugcase-report.zip', mimeType: 'application/zip', buffer: zip });

  // The dropped report opens: a tab bar appears and the drop UI is gone.
  await expect(page.getByTestId('report-tab-bar')).toBeVisible();
  await expect(page.getByTestId('empty')).toHaveCount(0);
  await assertKitchenSinkContent(page);

  expect(errors, `unexpected page errors: ${errors.join(' | ')}`).toEqual([]);
  expect(external, `unexpected external requests: ${external.join(' | ')}`).toEqual([]);
});
