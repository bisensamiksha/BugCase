import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

import { REPORT_ZIP_PATHS, zipFromDataUrl, type CapturedDownload } from './helpers/report-zip';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIST = path.resolve(here, '../../packages/extension/dist-chrome');

const CHROMIUM_ONLY =
  'Playwright can load unpacked MV3 extensions only in Chromium; Firefox extension-runtime ' +
  'E2E is handled via web-ext (see CONTRIBUTING.md).';

/** The secret block colour the fixture screenshot is filled with; must be absent from redacted pixels. */
const SECRET: [number, number, number] = [200, 50, 50];
/** The sub-region (x, y, w, h) blacked out — the rest of the shot keeps the secret colour. */
const REDACT_RECT = { x: 10, y: 10, width: 20, height: 20 } as const;
const SHOT = 40;

interface Fixtures {
  readonly secretDataUrl: string;
  readonly redactedDataUrl: string;
}

/**
 * Destructive-redaction integrity (S3-11).
 *
 * The overlay-side compositor (Konva flatten → pixel-overwrite) is proven at the module level in
 * `packages/extension/src/annotation/redaction.test.ts`. This spec proves the *other half* end-to-end
 * against the real service worker: a redacted screenshot handed to FINALIZE_REPORT replaces the original
 * blob and rides into the ZIP, and — decoded back through the browser's real PNG codec — the redacted
 * region carries no recoverable secret pixel while the original unredacted bytes are absent from the ZIP.
 */
test.describe('destructive redaction integrity (Chromium)', () => {
  test('redacted pixels are absent from the ZIP screenshot; the original blob is dropped', async ({
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', CHROMIUM_ONLY);

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
    });

    try {
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

      // Build the fixtures in a page (the SW has no document/canvas): a fully-secret screenshot, and a
      // redacted copy whose REDACT_RECT is overwritten with opaque black *directly on the pixel bytes*
      // (the same destructive technique the production compositor uses — not an antialiased fillRect).
      const fixtures = await page.evaluate(
        ({ secret, rect, size }): Fixtures => {
          const make = (redact: boolean): string => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = `rgb(${secret[0]}, ${secret[1]}, ${secret[2]})`;
            ctx.fillRect(0, 0, size, size);
            if (redact) {
              const img = ctx.getImageData(0, 0, size, size);
              for (let y = rect.y; y < rect.y + rect.height; y += 1) {
                for (let x = rect.x; x < rect.x + rect.width; x += 1) {
                  const i = (y * size + x) * 4;
                  img.data[i] = 0;
                  img.data[i + 1] = 0;
                  img.data[i + 2] = 0;
                  img.data[i + 3] = 255;
                }
              }
              ctx.putImageData(img, 0, 0);
            }
            return canvas.toDataURL('image/png');
          };
          return { secretDataUrl: make(false), redactedDataUrl: make(true) };
        },
        { secret: SECRET, rect: REDACT_RECT, size: SHOT },
      );

      // Stub the OS boundaries: captureVisibleTab returns the *secret* (unredacted) screenshot; downloads
      // are captured in-memory. The message handler, capture-flow, annotation finalize, and ZIP writer
      // all run as shipped.
      await worker.evaluate((secretDataUrl: string) => {
        const g = globalThis as unknown as {
          chrome: {
            downloads: { download: (...a: unknown[]) => unknown };
            tabs: { captureVisibleTab: (...a: unknown[]) => unknown };
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
            (cb as (dataUrl: string) => void)(secretDataUrl);
            return undefined;
          }
          return Promise.resolve(secretDataUrl);
        };
      }, fixtures.secretDataUrl);

      // Drive the real two-phase flow: capture (holds the secret screenshot) → finalize with the redacted
      // annotation payload (replaces the screenshot blob in the ZIP).
      const finalize = await page.evaluate(
        async ({ redactedDataUrl }): Promise<{ ok: boolean; reason?: string }> => {
          const g = globalThis as unknown as {
            crypto: { randomUUID: () => string };
            chrome: { runtime: { sendMessage: (m: unknown) => Promise<Record<string, unknown>> } };
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
                url: 'https://example.com/secret',
                title: 'Secret',
                origin: 'https://example.com',
                capturedAt: new Date().toISOString(),
                referrer: null,
              },
              viewport: {
                innerWidth: 40,
                innerHeight: 40,
                outerWidth: 40,
                outerHeight: 40,
                devicePixelRatio: 1,
                zoomEstimate: 1,
                screenWidth: 40,
                screenHeight: 40,
                orientation: null,
              },
              permissionsAtCapture: [],
              scrubbersApplied: [],
              userOptions,
            },
            userInput: {
              schemaVersion: 'v1',
              title: 'redaction',
              stepsToReproduce: '',
              severity: 'minor',
              notes: '',
            },
          });
          if (!captured.ok || !captured.reportId) {
            const reason = typeof captured.reason === 'string' ? captured.reason : 'capture failed';
            return { ok: false, reason };
          }
          const finalized = await g.chrome.runtime.sendMessage({
            type: 'bugcase/finalize-report',
            reportId: captured.reportId,
            removedIds: [],
            annotations: [{ konvaJson: '{"attrs":{}}', screenshotDataUrl: redactedDataUrl }],
          });
          return {
            ok: Boolean(finalized.ok),
            ...(typeof finalized.reason === 'string' ? { reason: finalized.reason } : {}),
          };
        },
        { redactedDataUrl: fixtures.redactedDataUrl },
      );

      expect(finalize.ok, `finalize failed: ${finalize.reason ?? 'unknown'}`).toBe(true);

      const downloads = await worker.evaluate(
        () =>
          (globalThis as unknown as { __bugcaseDownloads?: CapturedDownload[] })
            .__bugcaseDownloads ?? [],
      );
      expect(downloads).toHaveLength(1);
      const zipUrl = downloads[0]?.url;
      if (!zipUrl) throw new Error('no download captured');

      const zip = await zipFromDataUrl(zipUrl);
      const shotFile = zip.file(REPORT_ZIP_PATHS.viewportScreenshot);
      if (!shotFile) throw new Error('ZIP missing the viewport screenshot');
      const shotBase64 = await shotFile.async('base64');

      // The original unredacted screenshot bytes must NOT be what the ZIP carries.
      const secretBase64 = fixtures.secretDataUrl.split(',')[1] ?? '';
      expect(shotBase64).not.toBe(secretBase64);

      // Decode the ZIP's screenshot through the browser's real PNG codec and read the pixels back.
      const pixels = await page.evaluate(
        async ({ base64, rect, secret, size }) => {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('decode failed'));
            img.src = `data:image/png;base64,${base64}`;
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const at = (x: number, y: number): [number, number, number, number] => {
            const i = (y * canvas.width + x) * 4;
            return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
          };
          // Scan the redacted region for any non-opaque-black pixel (a recoverable leak).
          let leaked: { x: number; y: number; rgba: number[] } | null = null;
          for (let y = rect.y; y < rect.y + rect.height && !leaked; y += 1) {
            for (let x = rect.x; x < rect.x + rect.width; x += 1) {
              const [r, gg, b, a] = at(x, y);
              if (r !== 0 || gg !== 0 || b !== 0 || a !== 255) {
                leaked = { x, y, rgba: [r, gg, b, a] };
                break;
              }
            }
          }
          void size;
          void secret;
          return { leaked, cornerOutside: at(2, 2) };
        },
        { base64: shotBase64, rect: REDACT_RECT, secret: SECRET, size: SHOT },
      );

      // No pixel inside the redacted region is recoverable — every one decodes to opaque black.
      expect(pixels.leaked, `leaked pixel: ${JSON.stringify(pixels.leaked)}`).toBeNull();
      // Redaction is targeted: outside the rect the secret content is preserved (it wasn't blanket-blacked).
      expect(pixels.cornerOutside).toEqual([SECRET[0], SECRET[1], SECRET[2], 255]);
    } finally {
      await context.close();
    }
  });
});
