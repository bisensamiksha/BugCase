import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

/**
 * S3-01 — Preview/Review screen scaffold (Chromium).
 *
 * The capture flow is now two-phase: CAPTURE_REPORT assembles + *holds* the report and returns
 * `{ reportId, report, assetSizes }` WITHOUT downloading; FINALIZE_REPORT zips + downloads. This
 * spec proves the reachable, service-worker half of that contract: a real CAPTURE_REPORT returns a
 * reportId + a schema-shaped report + the screenshot asset size, and does NOT trigger a download.
 *
 * The overlay's form → preview transition and the artifact list rendering are proven at the jsdom
 * level (OverlayApp.test.tsx / PreviewApp.test.tsx), because mounting the overlay needs host-
 * permission injection the headless harness can't grant (see the S2-23 notes in docs/PROGRESS.md).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIST = path.resolve(here, '../../packages/extension/dist-chrome');
const FIXTURE_URL = pathToFileURL(path.resolve(here, 'fixtures/basic-page.html')).href;

const CHROMIUM_ONLY =
  'Playwright can load unpacked MV3 extensions only in Chromium; Firefox extension-runtime ' +
  'E2E is handled via web-ext (see CONTRIBUTING.md).';

/** A 1×1 PNG — stands in for `tabs.captureVisibleTab` so the test needs no focused display. */
const ONE_PX_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk' +
  '+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Shape the worker returns from the real `bugcase/capture-report` (capture-and-hold) handler. */
interface CaptureReportResult {
  readonly ok: boolean;
  readonly reportId?: string;
  readonly report?: { schemaVersion?: string; metadata?: { page?: { url?: string } } };
  readonly assetSizes?: { screenshot?: number };
  readonly reason?: string;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test.describe('S3-01 preview/review screen (Chromium)', () => {
  test('CAPTURE_REPORT holds a report and returns reportId + report + assetSizes (no download)', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    expect(
      await fileExists(path.join(EXTENSION_DIST, 'manifest.json')),
      `Missing ${EXTENSION_DIST}/manifest.json — build the extension first: pnpm build:chrome`,
    ).toBe(true);

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
    });

    try {
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;

      const pageUnderTest = await context.newPage();
      await pageUnderTest.goto(FIXTURE_URL);
      const pageTitle = await pageUnderTest.title();

      // Stub the screenshot source + record any download. Capture-and-hold must NOT download.
      const worker2 = context.serviceWorkers()[0] ?? worker;
      await worker2.evaluate((onePxPng: string) => {
        const g = globalThis as unknown as {
          chrome: {
            downloads: { download: (...args: unknown[]) => unknown };
            tabs: { captureVisibleTab: (...args: unknown[]) => unknown };
          };
          __bugcaseDownloads?: unknown[];
        };
        g.__bugcaseDownloads = [];
        g.chrome.downloads.download = (...args: unknown[]) => {
          g.__bugcaseDownloads?.push(args[0]);
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            (cb as (id: number) => void)(1);
            return undefined;
          }
          return Promise.resolve(1);
        };
        g.chrome.tabs.captureVisibleTab = (...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            (cb as (dataUrl: string) => void)(onePxPng);
            return undefined;
          }
          return Promise.resolve(onePxPng);
        };
      }, ONE_PX_PNG);

      const extensionPage = await context.newPage();
      await extensionPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

      const response = await extensionPage.evaluate(
        async (args: { fixtureUrl: string; title: string }): Promise<CaptureReportResult> => {
          const g = globalThis as unknown as {
            crypto: { randomUUID: () => string };
            chrome: { runtime: { sendMessage: (m: unknown) => Promise<CaptureReportResult> } };
          };
          return g.chrome.runtime.sendMessage({
            type: 'bugcase/capture-report',
            metadata: {
              id: g.crypto.randomUUID(),
              tool: {
                name: 'bugcase',
                version: '0.0.1',
                schemaVersion: 'v1',
                browserBuildTarget: 'chrome',
              },
              page: {
                url: args.fixtureUrl,
                title: args.title,
                origin: new URL(args.fixtureUrl).origin,
                capturedAt: new Date().toISOString(),
                referrer: null,
              },
              viewport: {
                innerWidth: 800,
                innerHeight: 600,
                outerWidth: 800,
                outerHeight: 600,
                devicePixelRatio: 1,
                zoomEstimate: 1,
                screenWidth: 800,
                screenHeight: 600,
                orientation: null,
              },
              permissionsAtCapture: [],
              scrubbersApplied: [],
              userOptions: {
                fullPageScreenshot: false,
                viewportScreenshot: true,
                domSnapshot: false,
                navigationHistory: false,
                consoleLogs: false,
                networkLog: false,
                browserInfo: false,
                screenInfo: false,
                installedExtensions: false,
                cookies: false,
                localStorage: false,
                sessionStorage: false,
                reproductionSteps: false,
                elementInspections: false,
              },
            },
            userInput: {
              schemaVersion: 'v1',
              title: 'E2E preview capture',
              stepsToReproduce: '',
              severity: 'minor',
              notes: '',
            },
          });
        },
        { fixtureUrl: FIXTURE_URL, title: pageTitle },
      );

      // Capture-and-hold returns the held report + a reportId + the screenshot size — no download.
      expect(response.ok, `capture failed: ${response.reason ?? 'unknown'}`).toBe(true);
      expect(response.reportId, 'capture should return a reportId').toBeTruthy();
      expect(response.report?.schemaVersion).toBe('v1');
      expect(response.report?.metadata?.page?.url).toBe(FIXTURE_URL);
      expect(response.assetSizes?.screenshot).toBeGreaterThan(0);

      const downloads = await worker2.evaluate(
        () =>
          (globalThis as unknown as { __bugcaseDownloads?: unknown[] }).__bugcaseDownloads ?? [],
      );
      expect(downloads, 'capture must not download until finalize').toHaveLength(0);
    } finally {
      await context.close();
    }
  });
});
