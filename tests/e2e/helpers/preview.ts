/**
 * Shared Playwright helpers for the preview/finalize + options E2E specs (S3-16).
 *
 * Consolidates the extension-launch, OS-boundary stubbing (screenshot source + download sink), and the
 * two-phase capture→finalize message plumbing that the preview specs need. Kept free of `@bugcase/*`
 * runtime imports so it loads cleanly in the Playwright runner; canonical ZIP paths live in
 * `./report-zip`. The existing capture specs predate this helper and are intentionally left as-is.
 */

import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The built, unpacked Chrome extension the E2E harness loads. */
export const EXTENSION_DIST = path.resolve(here, '../../../packages/extension/dist-chrome');

export const CHROMIUM_ONLY =
  'Playwright can load unpacked MV3 extensions only in Chromium; Firefox extension-runtime ' +
  'E2E is handled via web-ext (see CONTRIBUTING.md).';

/** A 1×1 PNG — stands in for `tabs.captureVisibleTab` so tests need no focused display. */
export const ONE_PX_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk' +
  '+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A `chrome.downloads.download` call captured by the worker stub. */
export interface CapturedDownload {
  readonly url: string;
  readonly filename: string;
}

/** The flat capture-options record the report message carries; everything off but the viewport shot. */
export type CaptureUserOptions = Record<string, boolean>;

export const VIEWPORT_ONLY_OPTIONS: CaptureUserOptions = {
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

export interface LaunchedExtension {
  readonly context: BrowserContext;
  readonly worker: Worker;
  readonly extensionId: string;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch a persistent Chromium context with the unpacked extension loaded, and resolve its service
 * worker + extension id. Pass `userDataDir` to persist `chrome.storage.local` across a relaunch.
 */
export async function launchExtension(
  opts: { userDataDir?: string } = {},
): Promise<LaunchedExtension> {
  expect(
    await fileExists(path.join(EXTENSION_DIST, 'manifest.json')),
    `Missing ${EXTENSION_DIST}/manifest.json — build the extension first: pnpm build:chrome`,
  ).toBe(true);

  const context = await chromium.launchPersistentContext(opts.userDataDir ?? '', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  return { context, worker, extensionId };
}

/**
 * Stub the OS boundaries in the service worker: `captureVisibleTab` returns `pngDataUrl`, and every
 * `downloads.download` is recorded in an in-memory `__bugcaseDownloads` sink (nothing hits disk). The
 * message handler, capture-flow, annotation finalize, and ZIP writer all run as shipped.
 */
export async function stubDownloadsAndCapture(worker: Worker, pngDataUrl: string): Promise<void> {
  await worker.evaluate((dataUrl: string) => {
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
        (cb as (dataUrl: string) => void)(dataUrl);
        return undefined;
      }
      return Promise.resolve(dataUrl);
    };
  }, pngDataUrl);
}

/** Read the downloads captured by {@link stubDownloadsAndCapture}. */
export function getCapturedDownloads(worker: Worker): Promise<CapturedDownload[]> {
  return worker.evaluate(
    () =>
      (globalThis as unknown as { __bugcaseDownloads?: CapturedDownload[] }).__bugcaseDownloads ??
      [],
  );
}

/** Shape the worker returns from CAPTURE_REPORT (capture-and-hold). */
export interface CaptureReportResult {
  readonly ok: boolean;
  readonly reportId?: string;
  readonly report?: { schemaVersion?: string; metadata?: { page?: { url?: string } } };
  readonly assetSizes?: { screenshot?: number };
  readonly reason?: string;
}

/** Send a real CAPTURE_REPORT from an extension page and resolve the held-report result. */
export function sendCaptureReport(
  page: Page,
  args: { url: string; title: string; userOptions?: CaptureUserOptions },
): Promise<CaptureReportResult> {
  return page.evaluate(
    async (a: {
      url: string;
      title: string;
      userOptions: CaptureUserOptions;
    }): Promise<CaptureReportResult> => {
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
            url: a.url,
            title: a.title,
            origin: new URL(a.url).origin,
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
          userOptions: a.userOptions,
        },
        userInput: {
          schemaVersion: 'v1',
          title: a.title,
          stepsToReproduce: '',
          severity: 'minor',
          notes: '',
        },
      });
    },
    { url: args.url, title: args.title, userOptions: args.userOptions ?? VIEWPORT_ONLY_OPTIONS },
  );
}

/** Result shape from FINALIZE_REPORT. */
export interface FinalizeResult {
  readonly ok: boolean;
  readonly filename?: string;
  readonly reason?: string;
}

/** Send a real FINALIZE_REPORT (ZIP + download) for a held report, dropping `removedIds`. */
export function sendFinalize(
  page: Page,
  reportId: string,
  removedIds: readonly string[],
): Promise<FinalizeResult> {
  return page.evaluate(
    async (a: { reportId: string; removedIds: readonly string[] }): Promise<FinalizeResult> => {
      const g = globalThis as unknown as {
        chrome: { runtime: { sendMessage: (m: unknown) => Promise<FinalizeResult> } };
      };
      return g.chrome.runtime.sendMessage({
        type: 'bugcase/finalize-report',
        reportId: a.reportId,
        removedIds: a.removedIds,
      });
    },
    { reportId, removedIds },
  );
}
