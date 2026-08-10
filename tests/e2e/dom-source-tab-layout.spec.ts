/**
 * DOM pane Source-tab layout E2E (BUG-07).
 *
 * This bug is invisible to the jsdom unit suite: jsdom's `getComputedStyle` special-cases the
 * `hidden` attribute and reports `display: none` regardless of the stylesheet, so the cascade that
 * actually breaks here cannot be reproduced there. It only shows up with the real Tailwind bundle in
 * a real engine, which is exactly what `report.html` gives us — so the regression test lives here.
 *
 * The defect: Tailwind's preflight hides `[hidden]` with
 * `[hidden]:where(:not([hidden="until-found"])){display:none}`. `:where()` contributes zero
 * specificity, so that rule ties with any `.flex` / `.grid` utility at (0,1,0) and loses on source
 * order, because preflight is emitted before the utilities. A display utility left on a hidden
 * tabpanel therefore keeps it laid out — and since the panel is also `flex-1`, it claimed half the
 * pane as an empty box that pushed the source below the fold.
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
  report = writeReportHtml(tempDir, 'dom-layout-report.html', await extractReportHtmlFromRealZip());
});

test.afterAll(() => {
  removeReportHtmlTempDir(tempDir);
});

/** Open the DOM pane of the loaded report. */
async function openDomPane(page: Page) {
  await page.goto(report.url);
  await page.getByTestId('nav-dom').click();
  await expect(page.getByTestId('dom-snapshot-pane')).toBeVisible({ timeout: 20_000 });
}

/** The highlighted source, or the plain-text fallback above the highlight size cap. */
const sourceBody = (page: Page) =>
  page.getByTestId('dom-source-highlighted').or(page.getByTestId('dom-source-plain'));

test.describe('Source tab', () => {
  test('puts the source at the top of the panel, with no empty box above it', async ({ page }) => {
    await openDomPane(page);
    await page.getByTestId('dom-tab-source').click();
    await expect(sourceBody(page)).toBeVisible({ timeout: 20_000 });

    // The symptom the user reported: the code has to be readable without scrolling past a void.
    await expect(sourceBody(page)).toBeInViewport();

    // The source panel must sit directly under the tablist — one `gap-3` (12px), not the height of
    // a leaked sibling panel.
    const tabs = await page.getByRole('tablist', { name: 'Snapshot views' }).boundingBox();
    const panel = await page.locator('#dom-panel-source').boundingBox();
    expect(tabs).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(panel!.y - (tabs!.y + tabs!.height)).toBeLessThan(40);
  });

  test('collapses the rendered panel instead of leaving it laid out', async ({ page }) => {
    await openDomPane(page);
    await page.getByTestId('dom-tab-source').click();
    await expect(sourceBody(page)).toBeVisible({ timeout: 20_000 });

    // The root cause, asserted directly: `hidden` must actually take the panel out of layout.
    await expect(page.locator('#dom-panel-rendered')).toBeHidden();
    expect(await page.locator('#dom-panel-rendered').boundingBox()).toBeNull();
  });

  test('still collapses the source panel when the Rendered tab is active', async ({ page }) => {
    await openDomPane(page);
    await expect(page.getByTestId('dom-preview-frame')).toBeVisible({ timeout: 20_000 });

    // The mirror case, so the fix cannot regress the default tab the same way.
    await expect(page.locator('#dom-panel-source')).toBeHidden();
    expect(await page.locator('#dom-panel-source').boundingBox()).toBeNull();
  });
});
