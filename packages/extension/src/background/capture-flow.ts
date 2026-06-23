import {
  BUG_REPORT_ZIP_LAYOUT,
  type BrowserInfo,
  type BugReportV1,
  type BugReportZipAssets,
  type CaptureMetadata,
  type NavigationLog,
  type ScreenshotRef,
  type ScreenshotsManifest,
  type UserInput,
} from '@bugcase/schema';

import type { DomSnapshotResult } from '../capture/dom-snapshot';
import type { CapturedScreenshot } from '../capture/screenshot-strategy';
import type { DebuggerNetworkCaptureResult } from '../debugger/run-network-capture';

import { buildCaptureReportFilename } from './downloads';

export interface CaptureFlowInput {
  readonly metadata: CaptureMetadata;
  readonly userInput: UserInput;
  /** Browser info collected in the page context; recorded as `report.browser`. */
  readonly browser?: BrowserInfo;
}

/** Injected effects so the orchestration is unit-testable without the browser. */
export interface CaptureFlowDeps {
  readonly captureScreenshot: () => Promise<CapturedScreenshot>;
  readonly writeZip: (report: BugReportV1, assets: BugReportZipAssets) => Promise<Blob>;
  readonly download: (blob: Blob, filename: string) => Promise<number>;
  readonly now?: () => Date;
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

/**
 * End-to-end capture: screenshot → assemble a `BugReportV1` (with metadata collected upstream
 * in the page context) → ZIP via the schema writer → download with a timestamped filename.
 * Runs in the service worker. Any failure (denied capture, download error) resolves to
 * `{ ok: false, reason }` rather than throwing.
 */
export async function runCaptureFlow(
  input: CaptureFlowInput,
  deps: CaptureFlowDeps,
): Promise<CaptureFlowResult> {
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
      browser: input.browser ?? null,
      console: null,
      network: null,
      dom: dom?.snapshot ?? null,
      storage: null,
      cookies: null,
      navigation,
      reproduction: null,
      elementInspections: null,
    };

    const files = new Map<string, Blob | string | Uint8Array>([[screenshotPath, shot.blob]]);
    if (dom) {
      files.set(dom.snapshot.contentPath, dom.html);
    }
    const assets: BugReportZipAssets = { files };

    const zip = await deps.writeZip(report, assets);
    const filename = buildCaptureReportFilename(
      deps.now?.() ?? new Date(),
      input.metadata.page.origin,
    );
    const downloadId = await deps.download(zip, filename);

    return {
      ok: true,
      downloadId,
      filename,
      byteSize: zip.size,
      ...(debuggerNetwork ? { debuggerNetwork } : {}),
    };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}
