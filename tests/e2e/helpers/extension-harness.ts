/**
 * Loaded-extension E2E harness (S4-20).
 *
 * Shared machinery for the specs that drive the *real* capture pipeline through the unpacked
 * extension: launching the persistent Chromium context, stubbing the two OS boundaries that break
 * headless CI (the screenshot source + the on-disk download), sending the shipped
 * `CAPTURE_REPORT`/`FINALIZE_REPORT` messages, and decoding the produced ZIP. Also owns the
 * representative capture-option matrix so its consumers stay declarative.
 *
 * Playwright loads MV3 extensions only in Chromium (`CHROMIUM_ONLY`); Firefox extension-runtime is a
 * `web-ext` concern. Kept free of bare `@bugcase/*` runtime imports — the runner executes from the
 * repo root where those don't resolve (see `extract-report-html.ts`); the `UserOptions` type is a
 * type-only import from schema source and is erased at build time.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import type JSZip from 'jszip';

import type { UserOptions } from '../../../packages/schema/src/v1/metadata';

import { zipFromDataUrl, type CapturedDownload } from './report-zip';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the built, unpacked Chrome extension the harness loads. */
export const EXTENSION_DIST = path.resolve(here, '../../../packages/extension/dist-chrome');

export const CHROMIUM_ONLY =
  'Playwright can load unpacked MV3 extensions only in Chromium; Firefox extension-runtime ' +
  'E2E is handled via web-ext (see CONTRIBUTING.md).';

/** A 1×1 PNG — stands in for `tabs.captureVisibleTab` so the harness needs no focused display. */
const ONE_PX_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk' +
  '+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** All capture options off — the minimal baseline the matrix builds combinations from. */
export const ALL_OFF: UserOptions = {
  fullPageScreenshot: false,
  viewportScreenshot: false,
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

/** Every capture option on — the kitchen-sink combination. */
export const ALL_ON: UserOptions = {
  fullPageScreenshot: true,
  viewportScreenshot: true,
  domSnapshot: true,
  navigationHistory: true,
  consoleLogs: true,
  networkLog: true,
  browserInfo: true,
  screenInfo: true,
  installedExtensions: true,
  cookies: true,
  localStorage: true,
  sessionStorage: true,
  reproductionSteps: true,
  elementInspections: true,
};

/** Turn the named options on over the all-off baseline. */
function only(...keys: readonly (keyof UserOptions)[]): UserOptions {
  const next = { ...ALL_OFF };
  for (const key of keys) {
    next[key] = true;
  }
  return next;
}

/** One combination in the representative matrix. */
export interface MatrixCase {
  readonly name: string;
  readonly userOptions: UserOptions;
}

/**
 * A representative capture-option matrix — every option observed on and off at least once (all-on +
 * all-off) plus the high-risk pairs/groups. Deliberately NOT the 2^n space: breadth comes from
 * representative selection, keeping the suite within a bounded CI budget.
 */
export const CAPTURE_MATRIX: readonly MatrixCase[] = [
  { name: 'all-off', userOptions: ALL_OFF },
  { name: 'all-on', userOptions: ALL_ON },
  // console + network share one page bridge / verifier token — the classic interaction pair.
  { name: 'console+network', userOptions: only('consoleLogs', 'networkLog') },
  // Both screenshot slots on — exercises the full-page-vs-viewport slot selection.
  { name: 'both-screenshots', userOptions: only('viewportScreenshot', 'fullPageScreenshot') },
  // The whole storage group together.
  { name: 'storage-group', userOptions: only('cookies', 'localStorage', 'sessionStorage') },
  // The two reproduction-workstream options together.
  { name: 'reproduction-group', userOptions: only('reproductionSteps', 'elementInspections') },
  // All three optional-permission-gated options together.
  {
    name: 'permission-group',
    userOptions: only('navigationHistory', 'cookies', 'installedExtensions'),
  },
];

/** A launched, unpacked extension: its persistent context, live service worker, and id. */
export interface LoadedExtension {
  readonly context: BrowserContext;
  readonly worker: Worker;
  readonly extensionId: string;
}

/** Launch a fresh persistent Chromium context with the unpacked extension loaded. */
export async function launchExtension(): Promise<LoadedExtension> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  return { context, worker, extensionId };
}

/** The service worker currently backing the extension (MV3 may respawn it between captures). */
async function currentWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

/**
 * Open the extension popup page — a context with `chrome.runtime` to send capture messages from.
 *
 * On a genuine fresh install the extension opens its options page (onboarding, S3-18), which can
 * interrupt this navigation ("interrupted by another navigation to …/options.html"). Retry a few times
 * so every extension spec that opens the popup stays deterministic under full-suite load.
 */
export async function openPopupPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  const url = `chrome-extension://${extensionId}/src/popup/popup.html`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'load' });
      return page;
    } catch (error) {
      if (attempt >= 3 || !String(error).includes('interrupted by another navigation')) {
        throw error;
      }
    }
  }
}

/** Open the extension popup page for a launched extension. */
export function openExtensionPage(ext: LoadedExtension): Promise<Page> {
  return openPopupPage(ext.context, ext.extensionId);
}

/**
 * Stub the two OS boundaries on the live worker: capture `chrome.downloads.download` calls onto
 * `__bugcaseDownloads`, and answer `chrome.tabs.captureVisibleTab` with a 1×1 PNG. Everything between
 * runs as shipped. Re-applied before every capture so an MV3 respawn can't drop it.
 */
export async function stubCaptureBoundaries(worker: Worker): Promise<void> {
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
}

/** Read the `chrome.downloads.download` calls captured by {@link stubCaptureBoundaries}. */
export async function readCapturedDownloads(worker: Worker): Promise<CapturedDownload[]> {
  return worker.evaluate(
    () =>
      (globalThis as unknown as { __bugcaseDownloads?: { url: string; filename: string }[] })
        .__bugcaseDownloads ?? [],
  );
}

/** The captured page's metadata (url/title/origin) recorded in the report. */
export interface CapturePageInfo {
  readonly url: string;
  readonly title: string;
  readonly origin: string;
}

/** Optional client-collected sections to supply in the `CAPTURE_REPORT` message. */
export interface CaptureSections {
  console?: unknown;
  network?: unknown;
  reproduction?: unknown;
  browser?: unknown;
  elementInspections?: unknown;
}

/** The user's typed report (`UserInput`) to attach; a minimal default is used when omitted. */
export interface CaptureUserInput {
  readonly schemaVersion: 'v1';
  readonly title: string;
  readonly stepsToReproduce: string;
  readonly severity: 'trivial' | 'minor' | 'major' | 'critical';
  readonly notes: string;
}

export interface RunCaptureInput {
  readonly userOptions: UserOptions;
  readonly sections?: CaptureSections;
  readonly page?: CapturePageInfo;
  readonly userInput?: CaptureUserInput;
}

export interface RunCaptureResult {
  readonly ok: boolean;
  readonly reportId?: string;
  readonly filename?: string;
  readonly reason?: string;
  /** The decoded downloaded ZIP, or `null` if capture failed / nothing was downloaded. */
  readonly zip: JSZip | null;
}

const DEFAULT_PAGE: CapturePageInfo = {
  url: 'https://example.com/login',
  title: 'Example — Sign in',
  origin: 'https://example.com',
};

const DEFAULT_USER_INPUT: CaptureUserInput = {
  schemaVersion: 'v1',
  title: 'E2E matrix capture',
  stepsToReproduce: '',
  severity: 'minor',
  notes: '',
};

/**
 * Run one full capture through the loaded extension: (re)stub the OS boundaries, optionally install
 * extra worker stubs (e.g. permission fakes), send `CAPTURE_REPORT`→`FINALIZE_REPORT` from `extPage`,
 * then decode the downloaded ZIP. Never throws for a capture the flow rejects — it returns `ok: false`
 * with the reason, mirroring the shipped handlers.
 */
export async function runCapture(
  ext: LoadedExtension,
  extPage: Page,
  input: RunCaptureInput,
  setupWorker?: (worker: Worker) => Promise<void>,
): Promise<RunCaptureResult> {
  const worker = await currentWorker(ext.context);
  await stubCaptureBoundaries(worker);
  if (setupWorker) {
    await setupWorker(worker);
  }

  const evalInput = {
    userOptions: input.userOptions as unknown as Record<string, boolean>,
    page: input.page ?? DEFAULT_PAGE,
    userInput: input.userInput ?? DEFAULT_USER_INPUT,
    sections: input.sections ?? {},
  };

  const result = await extPage.evaluate(
    async (arg: {
      userOptions: Record<string, boolean>;
      page: CapturePageInfo;
      userInput: CaptureUserInput;
      sections: CaptureSections;
    }): Promise<Omit<RunCaptureResult, 'zip'>> => {
      const g = globalThis as unknown as {
        crypto: { randomUUID: () => string };
        chrome: {
          runtime: { sendMessage: (m: unknown) => Promise<Omit<RunCaptureResult, 'zip'>> };
        };
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
          url: arg.page.url,
          title: arg.page.title,
          origin: arg.page.origin,
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
        userOptions: arg.userOptions,
      };
      const s = arg.sections;
      const captured = await g.chrome.runtime.sendMessage({
        type: 'bugcase/capture-report',
        metadata,
        userInput: arg.userInput,
        ...(s.console ? { console: s.console } : {}),
        ...(s.network ? { network: s.network } : {}),
        ...(s.reproduction ? { reproduction: s.reproduction } : {}),
        ...(s.browser ? { browser: s.browser } : {}),
        ...(s.elementInspections ? { elementInspections: s.elementInspections } : {}),
      });
      if (!captured.ok || !captured.reportId) {
        return { ok: false, ...(captured.reason ? { reason: captured.reason } : {}) };
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
    evalInput,
  );

  if (!result.ok) {
    return { ...result, zip: null };
  }
  const downloads = await readCapturedDownloads(worker);
  const last = downloads[downloads.length - 1];
  const zip = last ? await zipFromDataUrl(last.url) : null;
  return { ...result, zip };
}
