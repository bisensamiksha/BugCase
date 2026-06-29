import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

import {
  REPORT_ZIP_PATHS,
  hasEntry,
  readJsonEntry,
  zipFromDataUrl,
  type CapturedDownload,
} from './helpers/report-zip';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIST = path.resolve(here, '../../packages/extension/dist-chrome');
const FIXTURE_FILE = path.resolve(here, 'fixtures/capture-engine-page.html');

const CHROMIUM_ONLY =
  'Playwright can load unpacked MV3 extensions only in Chromium; Firefox extension-runtime ' +
  'E2E is handled via web-ext (see CONTRIBUTING.md).';

/** A 1×1 PNG — stands in for `tabs.captureVisibleTab` so the test needs no focused display. */
const ONE_PX_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk' +
  '+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

interface CaptureFinalizeResult {
  readonly ok: boolean;
  readonly reportId?: string;
  readonly filename?: string;
  readonly reason?: string;
}

/** Serve the fixture HTML and answer the page's `/bugcase-ping` fetch, on an ephemeral port. */
async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const html = await readFile(FIXTURE_FILE);
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url && req.url.startsWith('/bugcase-ping')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"pong":true}');
        return;
      }
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

test.describe('capture engine integration (Chromium)', () => {
  test('fixture emits known signals, and the engine produces a valid report ZIP', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const { server, baseUrl } = await startFixtureServer();
    const fixtureUrl = `${baseUrl}/capture-engine-page.html`;
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
    });

    try {
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;

      // ---- Part 1: the fixture page emits the known console/network/password signals. ----
      const consoleMessages: string[] = [];
      const requestUrls: string[] = [];
      const pageUnderTest = await context.newPage();
      pageUnderTest.on('console', (msg) => consoleMessages.push(msg.text()));
      pageUnderTest.on('request', (req) => requestUrls.push(req.url()));
      await pageUnderTest.goto(fixtureUrl);
      const pageTitle = await pageUnderTest.title();

      // The fixture sets a readiness flag once it has emitted its signals; wait for it.
      await pageUnderTest.waitForFunction(
        () => (window as unknown as { __bugcaseSignals?: unknown }).__bugcaseSignals !== undefined,
      );
      const signals = await pageUnderTest.evaluate(() => {
        const s = (
          window as unknown as {
            __bugcaseSignals: { cookieSet: boolean; passwordValue: string };
          }
        ).__bugcaseSignals;
        return { cookieSet: s.cookieSet, passwordValue: s.passwordValue };
      });

      expect(consoleMessages.some((m) => m.includes('console-log-signal'))).toBe(true);
      expect(consoleMessages.some((m) => m.includes('console-error-signal'))).toBe(true);
      expect(requestUrls.some((u) => u.includes('/bugcase-ping'))).toBe(true);
      expect(signals.cookieSet).toBe(true);
      // The known password value is present in the live page (the engine must mask it downstream).
      expect(signals.passwordValue).toBe('hunter2');

      // ---- Part 2: the real capture engine produces a report ZIP from a CAPTURE_REPORT message. ----
      // Stub only the OS boundaries that break headless CI (screenshot source + on-disk download);
      // the message handler, runCaptureFlow, and writeBugReportZip run as shipped.
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

      const extensionPage = await context.newPage();
      await extensionPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      const response = await extensionPage.evaluate(
        async (args: { fixtureUrl: string; title: string }): Promise<CaptureFinalizeResult> => {
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
            elementInspections: false,
          };
          // Phase 1: capture assembles + holds the report (no download yet).
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
              title: 'Login button does nothing',
              stepsToReproduce: '1. open /login\n2. click submit',
              severity: 'major',
              notes: 'happens every time',
            },
          });
          if (!captured.ok || !captured.reportId) {
            return { ok: false, reason: captured.reason ?? 'capture failed' };
          }
          // Phase 2: finalize (no removals) ZIPs + downloads the held report.
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
        { fixtureUrl, title: pageTitle },
      );

      expect(response.ok, `capture/finalize failed: ${response.reason ?? 'unknown'}`).toBe(true);
      expect(response.filename).toMatch(/^bugcase-.+\.zip$/);

      const downloads = await worker2.evaluate(
        () =>
          (globalThis as unknown as { __bugcaseDownloads?: CapturedDownload[] })
            .__bugcaseDownloads ?? [],
      );
      expect(downloads).toHaveLength(1);
      const download = downloads[0];
      if (!download) throw new Error('no download captured');

      const zip = await zipFromDataUrl(download.url);

      // Reachable engine outputs: canonical report + metadata + the viewport screenshot.
      expect(hasEntry(zip, REPORT_ZIP_PATHS.report)).toBe(true);
      expect(hasEntry(zip, REPORT_ZIP_PATHS.metadata)).toBe(true);
      expect(hasEntry(zip, REPORT_ZIP_PATHS.viewportScreenshot)).toBe(true);

      const report = await readJsonEntry<{
        schemaVersion: string;
        metadata: { page: { url: string } };
        userInput: { severity: string; title: string };
      }>(zip, REPORT_ZIP_PATHS.report);
      expect(report.schemaVersion).toBe('v1');
      expect(report.metadata.page.url).toBe(fixtureUrl);
      // The user's typed report (S2-21) round-trips through the engine into the ZIP.
      expect(report.userInput.severity).toBe('major');
      expect(report.userInput.title).toBe('Login button does nothing');

      // NOTE: asserting the scrubbed DOM snapshot + console/network entries *in the ZIP* is not
      // reachable from this headless harness — DOM/storage collection needs host-permission
      // executeScript (gated behind an action-click / un-grantable headless), and console/network
      // are not folded into the report yet. The password-scrub output is asserted at the module
      // level in packages/extension/src/background/capture-engine.integration.test.ts.
    } finally {
      await context.close();
      server.close();
    }
  });
});
