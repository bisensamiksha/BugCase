import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import {
  CHROMIUM_ONLY,
  ONE_PX_PNG,
  getCapturedDownloads,
  launchExtension,
  sendCaptureReport,
  sendFinalize,
  stubDownloadsAndCapture,
} from './helpers/preview';
import { REPORT_ZIP_PATHS, hasEntry, readJsonEntry, zipFromDataUrl } from './helpers/report-zip';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_URL = pathToFileURL(path.resolve(here, 'fixtures/basic-page.html')).href;

/**
 * S3-16 — Preview screen finalize + artifact removal (Chromium).
 *
 * The scaffold spec proves the capture-hold half (CAPTURE_REPORT returns a held report, no download).
 * This proves the *finalize* half against the real service worker: FINALIZE_REPORT zips + downloads the
 * held report, and the preview's per-artifact "remove before download" reaches the ZIP writer.
 *
 * Baked redaction (redaction-integrity.spec.ts) and element-picker accuracy
 * (element-inspector-picker.spec.ts) are proven in their own specs; the live overlay/preview UI needs
 * host-permission injection the headless harness can't grant and is covered at jsdom level
 * (PreviewApp.test.tsx / OverlayApp.test.tsx).
 */
test.describe('S3-16 preview screen finalize (Chromium)', () => {
  test('finalize zips + downloads the held report with its screenshot', async ({ browserName }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const { context, worker, extensionId } = await launchExtension();
    try {
      await stubDownloadsAndCapture(worker, ONE_PX_PNG);
      const page: Page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

      const captured = await sendCaptureReport(page, { url: FIXTURE_URL, title: 'Preview' });
      expect(captured.ok, `capture failed: ${captured.reason ?? 'unknown'}`).toBe(true);
      expect(captured.reportId).toBeTruthy();

      const finalized = await sendFinalize(page, captured.reportId!, []);
      expect(finalized.ok, `finalize failed: ${finalized.reason ?? 'unknown'}`).toBe(true);

      const downloads = await getCapturedDownloads(worker);
      expect(downloads).toHaveLength(1);
      const zip = await zipFromDataUrl(downloads[0]!.url);

      expect(hasEntry(zip, REPORT_ZIP_PATHS.report)).toBe(true);
      expect(hasEntry(zip, REPORT_ZIP_PATHS.viewportScreenshot)).toBe(true);
      const report = await readJsonEntry<{
        schemaVersion: string;
        metadata: { page: { url: string } };
      }>(zip, REPORT_ZIP_PATHS.report);
      expect(report.schemaVersion).toBe('v1');
      expect(report.metadata.page.url).toBe(FIXTURE_URL);
    } finally {
      await context.close();
    }
  });

  test('finalize honors removedIds — a removed artifact is absent from the ZIP', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const { context, worker, extensionId } = await launchExtension();
    try {
      await stubDownloadsAndCapture(worker, ONE_PX_PNG);
      const page: Page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

      const captured = await sendCaptureReport(page, { url: FIXTURE_URL, title: 'Preview' });
      expect(captured.ok, `capture failed: ${captured.reason ?? 'unknown'}`).toBe(true);
      // The captured report carries a viewport screenshot; the user removes it in the preview.
      expect(captured.assetSizes?.screenshot ?? 0).toBeGreaterThan(0);

      const finalized = await sendFinalize(page, captured.reportId!, ['screenshot']);
      expect(finalized.ok, `finalize failed: ${finalized.reason ?? 'unknown'}`).toBe(true);

      const downloads = await getCapturedDownloads(worker);
      expect(downloads).toHaveLength(1);
      const zip = await zipFromDataUrl(downloads[0]!.url);

      // The removed screenshot is gone from the ZIP and cleared in the report; the report itself remains.
      expect(hasEntry(zip, REPORT_ZIP_PATHS.report)).toBe(true);
      expect(hasEntry(zip, REPORT_ZIP_PATHS.viewportScreenshot)).toBe(false);
      const report = await readJsonEntry<{ screenshots: { viewport?: unknown } }>(
        zip,
        REPORT_ZIP_PATHS.report,
      );
      expect(report.screenshots.viewport).toBeUndefined();
    } finally {
      await context.close();
    }
  });
});
