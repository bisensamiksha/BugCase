import {
  BUG_REPORT_ZIP_LAYOUT,
  type BrowserInfo,
  type BugReportV1,
  type BugReportZipAssets,
  type CaptureMetadata,
  type ConsoleLog,
  type CookiesDump,
  type InstalledExtensionInfo,
  type NavigationLog,
  type NetworkLog,
  type ScreenshotRef,
  type ScreenshotsManifest,
  type StorageDump,
  type UserInput,
} from '@bugcase/schema';

import type { DomSnapshotResult } from '../capture/dom-snapshot';
import type { CapturedScreenshot } from '../capture/screenshot-strategy';
import type { DebuggerNetworkCaptureResult } from '../debugger/run-network-capture';
import type { ArtifactId } from '../preview/artifact-list';

import { buildCaptureReportFilename } from './downloads';

export interface CaptureFlowInput {
  readonly metadata: CaptureMetadata;
  readonly userInput: UserInput;
  /** Browser info collected in the page context; recorded as `report.browser`. */
  readonly browser?: BrowserInfo;
  /** Console ring-buffer log collected in the overlay (S2-25); recorded as `report.console`. */
  readonly console?: ConsoleLog | null;
  /** Network ring-buffer log collected in the overlay (S2-25); recorded as `report.network`. */
  readonly network?: NetworkLog | null;
}

/** Capture-side injected effects: assemble the report. Never downloads. */
export interface CaptureReportDeps {
  readonly captureScreenshot: () => Promise<CapturedScreenshot>;
  /**
   * Optional on-demand debugger network capture (S2-10). When provided it is invoked during the
   * flow; it never throws and shows a user banner while attached. Bodies are surfaced on the result
   * for a later ticket (S2-24) to fold into the report's NetworkLog.
   */
  readonly captureDebuggerNetwork?: () => Promise<DebuggerNetworkCaptureResult>;
  /**
   * Optional DOM snapshot collector (S2-13). When provided, the scrubbed outerHTML is written at its
   * contentPath and recorded as `report.dom`. Never throws; a `null` result means "no snapshot".
   */
  readonly collectDom?: () => Promise<DomSnapshotResult | null>;
  /**
   * Optional navigation-history collector (S2-15). When provided, its result is recorded as
   * `report.navigation`. Never throws; `null` means "not collected" (no `history` permission/error).
   */
  readonly collectNavigation?: () => Promise<NavigationLog | null>;
  /**
   * Optional installed-extensions collector (S2-16). When provided, its result is folded into
   * `report.browser.installedExtensions`. Never throws; `null` means "not collected" (no `management`
   * permission/error) and preserves whatever browser info already carried.
   */
  readonly collectExtensions?: () => Promise<readonly InstalledExtensionInfo[] | null>;
  /**
   * Optional cookies collector (S2-17). When provided, it is called with the captured page url and
   * its result is recorded as `report.cookies` (all values masked by default). Never throws; `null`
   * means "not collected" (no `cookies` permission/error).
   */
  readonly collectCookies?: (url: string) => Promise<CookiesDump | null>;
  /**
   * Optional local/session storage collector (S2-18). When provided, its result is recorded as
   * `report.storage` (secret-looking values masked by default). Never throws; `null` means "not
   * collected" (no tab id / restricted page / error).
   */
  readonly collectStorage?: () => Promise<StorageDump | null>;
}

/** Finalize-side injected effects: write the ZIP + download. */
export interface FinalizeReportDeps {
  readonly writeZip: (report: BugReportV1, assets: BugReportZipAssets) => Promise<Blob>;
  readonly download: (blob: Blob, filename: string) => Promise<number>;
  readonly now?: () => Date;
}

/** Combined deps for the one-shot `runCaptureFlow` (capture + finalize, no removals). */
export type CaptureFlowDeps = CaptureReportDeps & FinalizeReportDeps;

/** Result of assembling a report in `captureReport` (held in the worker until finalize). */
export interface CapturedReportResult {
  readonly ok: boolean;
  readonly report?: BugReportV1;
  readonly assets?: BugReportZipAssets;
  /** Byte sizes for binary artifacts the report only references (screenshot, DOM). */
  readonly assetSizes?: Partial<Record<ArtifactId, number>>;
  readonly debuggerNetwork?: DebuggerNetworkCaptureResult;
  readonly reason?: string;
}

export interface CaptureFlowResult {
  readonly ok: boolean;
  readonly downloadId?: number;
  readonly filename?: string;
  readonly byteSize?: number;
  readonly reason?: string;
  readonly debuggerNetwork?: DebuggerNetworkCaptureResult;
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const encoder = new TextEncoder();

/**
 * Capture phase: screenshot + optional collectors → assemble a `BugReportV1` and its asset files
 * (with metadata collected upstream in the page context). Runs in the service worker; never
 * downloads. Any failure (denied capture, collector error) resolves to `{ ok: false, reason }`.
 */
export async function captureReport(
  input: CaptureFlowInput,
  deps: CaptureReportDeps,
): Promise<CapturedReportResult> {
  try {
    const shot = await deps.captureScreenshot();

    // Optional on-demand debugger network capture (S2-10). Never throws; a banner is shown while
    // the debugger is attached. Bodies are carried on the result for S2-24 to map into the report.
    const debuggerNetwork = deps.captureDebuggerNetwork
      ? await deps.captureDebuggerNetwork()
      : undefined;

    // Optional DOM snapshot (S2-13): scrubbed outerHTML stored in the ZIP + recorded as report.dom.
    const dom = deps.collectDom ? await deps.collectDom() : null;

    // Optional navigation history (S2-15): recent visits behind the optional `history` permission.
    const navigation = deps.collectNavigation ? await deps.collectNavigation() : null;

    // Optional cookies (S2-17): the captured origin's cookies behind the optional `cookies`
    // permission, scoped to the page url. All values are masked by default inside the collector.
    const cookies = deps.collectCookies ? await deps.collectCookies(input.metadata.page.url) : null;

    // Optional local/session storage (S2-18): masked, bounded localStorage/sessionStorage read in
    // the page. Never throws; `null` means not collected.
    const storage = deps.collectStorage ? await deps.collectStorage() : null;

    // Optional installed extensions (S2-16): management.getAll behind the optional `management`
    // permission, folded into report.browser. Dropped if no browser info was collected upstream.
    const extensions = deps.collectExtensions ? await deps.collectExtensions() : null;
    const reportBrowser: BrowserInfo | null = input.browser
      ? { ...input.browser, installedExtensions: extensions ?? input.browser.installedExtensions }
      : null;

    // A full-page capture (CDP, or the future scroll-stitch) goes in the `fullPage` slot; a plain
    // viewport capture goes in `viewport`. Either way it's the report's primary screenshot.
    const isFullPage = shot.captureMethod !== 'visibleTab';
    const screenshotPath = isFullPage
      ? BUG_REPORT_ZIP_LAYOUT.screenshots.fullPage
      : BUG_REPORT_ZIP_LAYOUT.screenshots.viewport;
    const screenshotRef: ScreenshotRef = {
      path: screenshotPath,
      width: shot.width,
      height: shot.height,
      devicePixelRatio: shot.devicePixelRatio,
      captureMethod: shot.captureMethod,
      hasAnnotations: false,
    };
    const screenshots: ScreenshotsManifest = {
      schemaVersion: 'v1',
      ...(isFullPage ? { fullPage: screenshotRef } : { viewport: screenshotRef }),
      elementCrops: [],
    };

    const report: BugReportV1 = {
      schemaVersion: 'v1',
      metadata: input.metadata,
      userInput: input.userInput,
      screenshots,
      browser: reportBrowser,
      console: input.console ?? null,
      network: input.network ?? null,
      dom: dom?.snapshot ?? null,
      storage,
      cookies,
      navigation,
      reproduction: null,
      elementInspections: null,
    };

    const files = new Map<string, Blob | string | Uint8Array>([[screenshotPath, shot.blob]]);
    if (dom) {
      files.set(dom.snapshot.contentPath, dom.html);
    }

    const assetSizes: Partial<Record<ArtifactId, number>> = { screenshot: shot.blob.size };
    if (dom) {
      assetSizes.dom = encoder.encode(dom.html).length;
    }

    return {
      ok: true,
      report,
      assets: { files },
      assetSizes,
      ...(debuggerNetwork ? { debuggerNetwork } : {}),
    };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}

const EMPTY_SCREENSHOTS: ScreenshotsManifest = { schemaVersion: 'v1', elementCrops: [] };

/**
 * Produce a trimmed report + assets with the chosen artifacts removed. `metadata`, `userInput`,
 * `reproduction`, and `elementInspections` are non-removable and ignored if present in `removedIds`.
 * Pure — the inputs are not mutated.
 */
export function applyArtifactRemovals(
  report: BugReportV1,
  assets: BugReportZipAssets,
  removedIds: readonly ArtifactId[],
): { report: BugReportV1; assets: BugReportZipAssets } {
  if (removedIds.length === 0) {
    return { report, assets };
  }
  const removed = new Set(removedIds);
  const files = new Map(assets.files);
  let next = report;

  if (removed.has('screenshot')) {
    for (const ref of [
      report.screenshots.viewport,
      report.screenshots.fullPage,
      ...report.screenshots.elementCrops,
    ]) {
      if (ref) {
        files.delete(ref.path);
      }
    }
    next = { ...next, screenshots: EMPTY_SCREENSHOTS };
  }
  if (removed.has('dom')) {
    if (report.dom) {
      files.delete(report.dom.contentPath);
    }
    next = { ...next, dom: null };
  }
  if (removed.has('browser')) next = { ...next, browser: null };
  if (removed.has('console')) next = { ...next, console: null };
  if (removed.has('network')) next = { ...next, network: null };
  if (removed.has('storage')) next = { ...next, storage: null };
  if (removed.has('cookies')) next = { ...next, cookies: null };
  if (removed.has('navigation')) next = { ...next, navigation: null };

  return { report: next, assets: { files } };
}

/**
 * Finalize phase: apply removals → ZIP via the schema writer → download with a timestamped
 * filename. Runs in the service worker. Any failure resolves to `{ ok: false, reason }`.
 */
export async function finalizeReport(
  report: BugReportV1,
  assets: BugReportZipAssets,
  removedIds: readonly ArtifactId[],
  deps: FinalizeReportDeps,
): Promise<CaptureFlowResult> {
  try {
    const trimmed = applyArtifactRemovals(report, assets, removedIds);
    const zip = await deps.writeZip(trimmed.report, trimmed.assets);
    const filename = buildCaptureReportFilename(
      deps.now?.() ?? new Date(),
      trimmed.report.metadata.page.origin,
    );
    const downloadId = await deps.download(zip, filename);
    return { ok: true, downloadId, filename, byteSize: zip.size };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}

/**
 * End-to-end one-shot capture: `captureReport` → `finalizeReport` (no removals). Runs in the
 * service worker. Any failure resolves to `{ ok: false, reason }`. (The preview flow holds the
 * captured report between these two phases instead of running them back-to-back.)
 */
export async function runCaptureFlow(
  input: CaptureFlowInput,
  deps: CaptureFlowDeps,
): Promise<CaptureFlowResult> {
  const captured = await captureReport(input, deps);
  if (!captured.ok || !captured.report || !captured.assets) {
    return { ok: false, ...(captured.reason ? { reason: captured.reason } : {}) };
  }
  const result = await finalizeReport(captured.report, captured.assets, [], deps);
  return result.ok && captured.debuggerNetwork
    ? { ...result, debuggerNetwork: captured.debuggerNetwork }
    : result;
}
