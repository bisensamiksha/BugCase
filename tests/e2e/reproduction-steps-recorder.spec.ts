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

/** A typed-secret sentinel: it must NEVER appear in the report — reproduction records no values. */
const SECRET_SENTINEL = 'super-secret-password-value';

interface CaptureFinalizeResult {
  readonly ok: boolean;
  readonly reportId?: string;
  readonly filename?: string;
  readonly reason?: string;
}

interface ReproStepShape {
  readonly id: string;
  readonly type: string;
  readonly selector: string;
  readonly metadata: Record<string, unknown>;
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

const MAIN_ENTRY_FILE = path.resolve(
  here,
  '../../packages/extension/dist-chrome/injected/main-entry.js',
);
const BRIDGE_SOURCE = 'bugcase-bridge';

test.describe('reproduction-steps recorder — live MAIN-world capture (Chromium)', () => {
  test('the injected recorder captures a real click and flushes it, never recording typed values', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);
    test.setTimeout(30000);

    // Inject the *built* MAIN-world recorder into a real page — exactly what the overlay now does on
    // open (executeScript, world: 'MAIN'). This proves the piece that was broken in the field: the
    // recorder arms from a control message, captures a genuine browser click, and flushes over the
    // bridge — none of which happens if the script was never injected.
    const mainEntry = await readFile(MAIN_ENTRY_FILE, 'utf8');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(
        '<button id="trigger" type="button">go</button><input id="password" type="password" />',
      );
      // Run the built MAIN-world IIFE as a real <script> in the page's main world (what executeScript
      // world:'MAIN' does in the extension). addScriptTag executes it in the same world page.evaluate
      // sees, so the recorder + bridge responder are actually installed here.
      await page.addScriptTag({ content: mainEntry });

      // Arm the recorder the way the overlay does — a recorder-control message over the page window —
      // and collect the per-step push (recorder-step) the overlay relays to durable storage (Part B).
      await page.evaluate((source: string) => {
        (window as unknown as { __pushed: unknown[] }).__pushed = [];
        window.addEventListener('message', (event) => {
          const d = event.data as { source?: string; kind?: string; step?: unknown };
          if (d?.source === source && d.kind === 'recorder-step') {
            (window as unknown as { __pushed: unknown[] }).__pushed.push(d.step);
          }
        });
        window.postMessage(
          { source, kind: 'recorder-control', action: 'start', token: 'e2e-session' },
          '*',
        );
      }, BRIDGE_SOURCE);
      await page.waitForTimeout(50); // let the posted control message deliver before interacting

      await page.click('#trigger');
      await page.fill('#password', 'super-secret-password-value');

      // The click was pushed step-by-step (this is what survives a navigation).
      const pushed = (await page.evaluate(
        () =>
          (window as unknown as { __pushed: Array<{ type?: string; selector?: string }> }).__pushed,
      )) as Array<{ type?: string; selector?: string }>;
      expect(pushed.some((s) => s.type === 'click' && s.selector === '#trigger')).toBe(true);

      // Flush the reproduction channel the way capture does — a flush-request over the bridge. Resolve
      // after a bounded wait so a broken bridge surfaces as a diagnostic instead of a 2-minute hang.
      const result = await page.evaluate(
        (source: string) =>
          new Promise<{ installed: boolean; entries: unknown[] }>((resolve) => {
            const installed = Boolean(
              (window as unknown as Record<string, unknown>).__bugcasePassiveMainInstalled,
            );
            let settled = false;
            const finish = (entries: unknown[]): void => {
              if (settled) return;
              settled = true;
              window.removeEventListener('message', onMsg);
              resolve({ installed, entries });
            };
            const onMsg = (event: MessageEvent): void => {
              const d = event.data as {
                source?: string;
                kind?: string;
                channel?: string;
                entries?: unknown[];
              };
              if (
                d?.source === source &&
                d.kind === 'flush-response' &&
                d.channel === 'reproduction'
              ) {
                finish(d.entries ?? []);
              }
            };
            window.addEventListener('message', onMsg);
            window.postMessage(
              { source, kind: 'flush-request', channel: 'reproduction', id: 'f1', token: 'f1' },
              '*',
            );
            setTimeout(() => finish([]), 3000);
          }),
        BRIDGE_SOURCE,
      );

      expect(result.installed, 'main-entry did not install in this world').toBe(true);
      const steps = result.entries as Array<{
        type: string;
        selector: string;
        description: string;
        metadata: Record<string, unknown>;
      }>;
      // The real click was captured with the stable selector AND a human-readable label ("go").
      const click = steps.find((s) => s.type === 'click' && s.selector === '#trigger');
      expect(click).toBeDefined();
      expect(click?.metadata.label).toBe('go');
      expect(click?.description).toBe('Clicked "go" (button)');
      // Clicks only: typing into the password field is never recorded, so its value can't leak.
      expect(steps.every((s) => s.type === 'click')).toBe(true);
      expect(JSON.stringify(steps)).not.toContain('super-secret-password-value');
    } finally {
      await browser.close();
    }
  });
});

test.describe('reproduction-steps recorder (Chromium)', () => {
  test('a reproduction recording round-trips into the report ZIP without leaking typed values', async ({
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

      // Stub the OS boundaries that break headless CI (screenshot source + on-disk download); the
      // message handler, captureReport (which threads `reproduction` into the report), and
      // writeBugReportZip run as shipped.
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
            reproductionSteps: true,
            elementInspections: false,
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
              title: 'Repro',
              stepsToReproduce: '',
              severity: 'minor',
              notes: '',
            },
            // The shape the overlay flushes + maps at capture time (S3-12): a stable selector + coarse
            // control metadata per step, and — critically — no typed value on the password input.
            reproduction: {
              schemaVersion: 'v1',
              startedAt: '2026-07-04T10:00:00.000Z',
              endedAt: '2026-07-04T10:00:30.000Z',
              steps: [
                {
                  id: 'r1',
                  type: 'click',
                  selector: '#trigger',
                  description: 'Clicked #trigger',
                  timestamp: '2026-07-04T10:00:05.000Z',
                  metadata: { tag: 'button' },
                },
                {
                  id: 'r2',
                  type: 'input',
                  selector: '#password',
                  description: 'Edited #password',
                  timestamp: '2026-07-04T10:00:10.000Z',
                  metadata: { tag: 'input', inputType: 'password' },
                },
              ],
            },
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
        { fixtureUrl, title: pageTitle },
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
        reproduction: {
          schemaVersion: string;
          startedAt: string;
          endedAt: string;
          steps: ReproStepShape[];
        } | null;
      }>(zip, REPORT_ZIP_PATHS.report);

      // The recording is present in the report, with its stable selectors preserved.
      expect(report.reproduction).not.toBeNull();
      expect(report.reproduction?.schemaVersion).toBe('v1');
      expect(report.reproduction?.startedAt).toBe('2026-07-04T10:00:00.000Z');
      expect(report.reproduction?.steps.map((s) => s.selector)).toEqual(['#trigger', '#password']);

      // The password step carries only control identity — never a typed value.
      const passwordStep = report.reproduction?.steps.find((s) => s.selector === '#password');
      expect(passwordStep?.metadata).toEqual({ tag: 'input', inputType: 'password' });
      expect(Object.keys(passwordStep?.metadata ?? {})).not.toContain('value');

      // Belt-and-suspenders: no typed secret anywhere in the serialized report ZIP.
      const rawReport = JSON.stringify(report);
      expect(rawReport).not.toContain(SECRET_SENTINEL);

      // NOTE: driving the *live* MAIN-world recorder (real click/input/scroll → steps) is not
      // reachable in this headless harness — the recorder is a document_start MAIN-world script gated
      // on an allowlisted origin + host-permission injection. The recording behavior (selectors,
      // never-capture-values, arm/disarm) is proven at the module level in
      // packages/extension/src/injected/{selector,reproduction-recorder}.test.ts.
    } finally {
      await context.close();
      server.close();
    }
  });
});
