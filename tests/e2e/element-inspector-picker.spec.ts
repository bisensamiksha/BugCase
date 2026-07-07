import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

import { REPORT_ZIP_PATHS, hasEntry, readJsonEntry, zipFromDataUrl } from './helpers/report-zip';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIST = path.resolve(here, '../../packages/extension/dist-chrome');
const FIXTURE_FILE = path.resolve(here, 'fixtures/basic-page.html');

const CHROMIUM_ONLY =
  'Playwright can load unpacked MV3 extensions only in Chromium; Firefox extension-runtime ' +
  'E2E is handled via web-ext (see CONTRIBUTING.md).';

const ONE_PX_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk' +
  '+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A visible-content sentinel: it lives in the raw outerHTML but the picker sends it scrubbed already. */
const SECRET_SENTINEL = 'super-secret-inspection-value';

interface CaptureFinalizeResult {
  readonly ok: boolean;
  readonly reportId?: string;
  readonly filename?: string;
  readonly reason?: string;
}

interface InspectionShape {
  readonly id: string;
  readonly outerHtml: string;
  readonly computedStyles: Record<string, string>;
  readonly boundingClientRect: { x: number; y: number; width: number; height: number };
  readonly ancestors: readonly { tag: string; id: string | null; classes: readonly string[] }[];
  readonly screenshotCropPath: string;
}

async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const html = await readFile(FIXTURE_FILE);
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test.describe('element inspector picker (Chromium)', () => {
  test('a picked element inspection round-trips into the report ZIP with its crop', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const { server, baseUrl } = await startFixtureServer();
    const fixtureUrl = `${baseUrl}/basic-page.html`;
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
    });

    try {
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;

      const pageUnderTest = await context.newPage();
      await pageUnderTest.goto(fixtureUrl);
      const pageTitle = await pageUnderTest.title();

      // Stub the OS boundaries (screenshot source + on-disk download); captureReport (which folds
      // elementInspections into the report + ZIP) and writeBugReportZip run as shipped.
      await worker.evaluate((onePxPng: string) => {
        const g = globalThis as unknown as {
          chrome: {
            downloads: { download: (...args: unknown[]) => unknown };
            tabs: { captureVisibleTab: (...args: unknown[]) => unknown };
          };
          __bugcaseDownloads?: { url: string; filename: string }[];
        };
        g.__bugcaseDownloads = [];
        g.chrome.downloads.download = (...args: unknown[]) => {
          const opts = args[0] as { url: string; filename: string };
          g.__bugcaseDownloads?.push({ url: opts.url, filename: opts.filename });
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
        async (args: {
          fixtureUrl: string;
          title: string;
          crop: string;
        }): Promise<CaptureFinalizeResult> => {
          const g = globalThis as unknown as {
            crypto: { randomUUID: () => string };
            chrome: { runtime: { sendMessage: (m: unknown) => Promise<CaptureFinalizeResult> } };
          };
          const userOptions = {
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
            elementInspections: true,
          };
          const captured = await g.chrome.runtime.sendMessage({
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
              userOptions,
            },
            userInput: {
              schemaVersion: 'v1',
              title: 'Inspect',
              stepsToReproduce: '',
              severity: 'minor',
              notes: '',
            },
            // The shape the overlay sends per picked element (S3-13): the outerHTML is already scrubbed
            // by the picker; the crop rides along as a data URL the worker rehydrates into the ZIP.
            elementInspections: [
              {
                outerHtml: '<button id="go" class="primary">Go</button>',
                computedStyles: { display: 'inline-flex', color: 'rgb(0, 0, 0)' },
                boundingClientRect: { x: 12, y: 34, width: 100, height: 40 },
                ancestors: [
                  { tag: 'section', id: null, classes: ['a', 'b'] },
                  { tag: 'main', id: 'root', classes: [] },
                ],
                cropDataUrl: args.crop,
              },
            ],
          });
          if (!captured.ok || !captured.reportId) {
            return { ok: false, reason: captured.reason ?? 'capture failed' };
          }
          const finalized = await g.chrome.runtime.sendMessage({
            type: 'bugcase/finalize-report',
            reportId: captured.reportId,
            removedIds: [],
          });
          return {
            ok: finalized.ok,
            reportId: captured.reportId,
            ...(finalized.filename ? { filename: finalized.filename } : {}),
            ...(finalized.reason ? { reason: finalized.reason } : {}),
          };
        },
        { fixtureUrl, title: pageTitle, crop: ONE_PX_PNG },
      );

      expect(response.ok, `capture/finalize failed: ${response.reason ?? 'unknown'}`).toBe(true);

      const downloads = await worker.evaluate(
        () =>
          (globalThis as unknown as { __bugcaseDownloads?: { url: string; filename: string }[] })
            .__bugcaseDownloads ?? [],
      );
      const download = downloads[0];
      if (!download) throw new Error('no download captured');

      const zip = await zipFromDataUrl(download.url);
      expect(hasEntry(zip, REPORT_ZIP_PATHS.report)).toBe(true);

      const report = await readJsonEntry<{
        elementInspections: {
          schemaVersion: string;
          inspections: InspectionShape[];
        } | null;
        screenshots: { elementCrops: { path: string }[] };
      }>(zip, REPORT_ZIP_PATHS.report);

      // The inspection is present with its structural facts.
      expect(report.elementInspections).not.toBeNull();
      const inspection = report.elementInspections?.inspections[0];
      expect(inspection?.outerHtml).toContain('id="go"');
      expect(inspection?.computedStyles).toMatchObject({ display: 'inline-flex' });
      expect(inspection?.ancestors.map((a) => a.tag)).toEqual(['section', 'main']);

      // The crop was written to the ZIP and referenced from the inspection + elementCrops.
      const cropPath = inspection?.screenshotCropPath ?? '';
      expect(cropPath).toMatch(/^screenshots\/crops\//);
      expect(hasEntry(zip, cropPath)).toBe(true);
      expect(report.screenshots.elementCrops.map((c) => c.path)).toContain(cropPath);

      // No leaked sentinel anywhere in the serialized report.
      expect(JSON.stringify(report)).not.toContain(SECRET_SENTINEL);

      // NOTE: driving the *live* picker (hover-highlight → real click → build inspection + crop) is not
      // reachable headless — it needs the isolated-world overlay + host-permission screenshot. The
      // picker, inspection builder, crop geometry, and finalize are proven at the module level in
      // packages/extension/src/{injected/element-picker,capture/element-inspection,background/element-crop,
      // background/element-inspection-finalize}.test.ts.
    } finally {
      await context.close();
      server.close();
    }
  });
});
