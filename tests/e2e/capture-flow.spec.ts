import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium, expect, test } from '@playwright/test';
import JSZip from 'jszip';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIST = path.resolve(here, '../../packages/extension/dist-chrome');
const FIXTURE_URL = pathToFileURL(path.resolve(here, 'fixtures/basic-page.html')).href;
const JSZIP_DIST = path.resolve(here, '../../node_modules/jszip/dist/jszip.min.js');

const CHROMIUM_ONLY =
  'Playwright can load unpacked MV3 extensions only in Chromium; Firefox extension-runtime ' +
  'E2E is handled via web-ext (see CONTRIBUTING.md).';

/** A 1×1 PNG — stands in for `tabs.captureVisibleTab` so the test needs no focused display. */
const ONE_PX_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk' +
  '+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Shape the service worker returns from the real `bugcase/capture-report` handler. */
interface CaptureReportResult {
  readonly ok: boolean;
  readonly filename?: string;
  readonly downloadId?: number;
  readonly reason?: string;
}

interface CapturedDownload {
  readonly url: string;
  readonly filename: string;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test.describe('extension capture pipeline (Chromium)', () => {
  test('loads the unpacked extension and produces a report ZIP with parseable metadata.json', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    expect(
      await fileExists(path.join(EXTENSION_DIST, 'manifest.json')),
      `Missing ${EXTENSION_DIST}/manifest.json — build the extension first: pnpm build:chrome`,
    ).toBe(true);

    // New headless Chromium supports loading unpacked extensions.
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
    });

    try {
      // The MV3 background service worker may register a moment after launch.
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;

      // Open the page under test, then trigger capture from an extension page (which has
      // `chrome.runtime`) by sending the real CAPTURE_REPORT message.
      const pageUnderTest = await context.newPage();
      await pageUnderTest.goto(FIXTURE_URL);
      const pageTitle = await pageUnderTest.title();

      const extensionPage = await context.newPage();
      await extensionPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

      // Stub only the OS boundaries that aren't under test and break headless CI: the
      // screenshot source and the on-disk download. Everything between — the real message
      // handler, runCaptureFlow, and writeBugReportZip — runs as shipped. Install on the
      // *current* worker immediately before triggering, so an MV3 respawn can't drop it.
      const worker2 = context.serviceWorkers()[0] ?? worker;
      await worker2.evaluate((onePxPng: string) => {
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

      const response = await extensionPage.evaluate(
        async (args: { fixtureUrl: string; title: string }): Promise<CaptureReportResult> => {
          const g = globalThis as unknown as {
            crypto: { randomUUID: () => string };
            chrome: { runtime: { sendMessage: (m: unknown) => Promise<CaptureReportResult> } };
          };
          const metadata = {
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
          };
          const userInput = {
            schemaVersion: 'v1',
            title: 'E2E capture',
            stepsToReproduce: '',
            severity: 'minor',
            notes: '',
          };
          return g.chrome.runtime.sendMessage({
            type: 'bugcase/capture-report',
            metadata,
            userInput,
          });
        },
        { fixtureUrl: FIXTURE_URL, title: pageTitle },
      );

      expect(response.ok, `capture failed: ${response.reason ?? 'unknown'}`).toBe(true);
      expect(response.filename).toMatch(/^bugcase-.+\.zip$/);

      // The flow downloaded the ZIP as a data URL; decode it and inspect the real output.
      const captured = await worker2.evaluate(
        () =>
          (globalThis as unknown as { __bugcaseDownloads?: CapturedDownload[] })
            .__bugcaseDownloads ?? [],
      );
      expect(captured).toHaveLength(1);
      const download = captured[0];
      if (!download) throw new Error('no download was captured');
      expect(download.filename).toBe(response.filename);

      const base64 = download.url.slice(download.url.indexOf(',') + 1);
      const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));

      // Canonical entries written by the shipped writeBugReportZip + capture flow.
      expect(zip.file('report.json')).not.toBeNull();
      expect(zip.file('screenshots/viewport.png')).not.toBeNull();

      const metadataEntry = zip.file('metadata.json');
      if (!metadataEntry) throw new Error('metadata.json missing from report ZIP');
      const parsed = JSON.parse(await metadataEntry.async('string')) as {
        id: string;
        tool: { name: string; schemaVersion: string };
        page: { url: string };
      };
      expect(parsed.tool.name).toBe('bugcase');
      expect(parsed.tool.schemaVersion).toBe('v1');
      expect(parsed.page.url).toBe(FIXTURE_URL);
      expect(parsed.id).toMatch(/^[0-9a-f-]{36}$/i);
    } finally {
      await context.close();
    }
  });
});

test.describe('report ZIP is consumable cross-browser', () => {
  test('builds and re-parses metadata.json via JSZip', async ({ page }) => {
    await page.goto(FIXTURE_URL);
    expect(await fileExists(JSZIP_DIST), `Missing ${JSZIP_DIST}`).toBe(true);
    await page.addScriptTag({ path: JSZIP_DIST });

    const toolName = await page.evaluate(async () => {
      interface InPageZip {
        file(path: string): { async(type: 'string'): Promise<string> } | null;
        file(path: string, data: string): InPageZip;
        generateAsync(opts: { type: 'uint8array' }): Promise<Uint8Array>;
      }
      interface InPageJSZip {
        new (): InPageZip;
        loadAsync(data: Uint8Array): Promise<InPageZip>;
      }
      const g = globalThis as unknown as { JSZip: InPageJSZip };

      const sample = { tool: { name: 'bugcase', schemaVersion: 'v1' } };
      const zip = new g.JSZip();
      zip.file('metadata.json', JSON.stringify(sample));
      const bytes = await zip.generateAsync({ type: 'uint8array' });

      const reloaded = await g.JSZip.loadAsync(bytes);
      const entry = reloaded.file('metadata.json');
      if (!entry) throw new Error('metadata.json missing after round-trip');
      const parsed = JSON.parse(await entry.async('string')) as { tool: { name: string } };
      return parsed.tool.name;
    });

    expect(toolName).toBe('bugcase');
  });
});
