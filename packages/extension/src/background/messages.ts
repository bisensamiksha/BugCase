import type {
  BrowserInfo,
  BugReportV1,
  CaptureMetadata,
  ConsoleLog,
  NetworkLog,
  ReproductionRecording,
  UserInput,
} from '@bugcase/schema';

import type { VisibleTabCapture } from '../capture/capture-visible-tab';
import type { ArtifactId } from '../preview/artifact-list';

import type { CaptureFlowResult } from './capture-flow';
import type { CropElementPayload, CropElementResponse } from './element-crop';
import type { CaptureElementInspection } from './element-inspection-finalize';

/** Runtime message: popup/overlay → service worker, asking it to capture the visible tab. */
export const CAPTURE_VISIBLE_TAB = 'bugcase/capture-visible-tab';

export interface CaptureVisibleTabRequest {
  readonly type: typeof CAPTURE_VISIBLE_TAB;
  readonly windowId?: number | undefined;
  readonly devicePixelRatio?: number | undefined;
}

/**
 * Serializable capture response. Blobs cannot cross the runtime message boundary, so
 * the worker sends the PNG data URL; the receiver rebuilds the Blob with `dataUrlToBlob`.
 */
export interface CaptureVisibleTabResponse {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly captureMethod: VisibleTabCapture['captureMethod'];
}

/** Runtime message: popup → service worker, asking it to inject the overlay into the active tab. */
export const OVERLAY_INJECT = 'bugcase/overlay-inject';

export interface OverlayInjectRequest {
  readonly type: typeof OVERLAY_INJECT;
}

/** Serializable result of an overlay inject attempt; `ok` is false on a handled failure. */
export interface OverlayInjectResponse {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Runtime message: overlay → service worker, asking it to run the full capture → ZIP → download. */
export const CAPTURE_REPORT = 'bugcase/capture-report';

export interface CaptureReportRequest {
  readonly type: typeof CAPTURE_REPORT;
  /** Collected in the page/overlay context (needs the DOM); the worker has no window. */
  readonly metadata: CaptureMetadata;
  readonly userInput: UserInput;
  /** Browser info (UA / UA-CH / languages / timezone), collected alongside metadata in the page. */
  readonly browser: BrowserInfo;
  /** Console ring-buffer log, flushed + mapped in the overlay (S2-25); `null` when not collected. */
  readonly console?: ConsoleLog | null;
  /** Network ring-buffer log, flushed + scrubbed in the overlay (S2-25); `null` when not collected. */
  readonly network?: NetworkLog | null;
  /** Reproduction recording, flushed + mapped in the overlay (S3-12); `null` when not recorded. */
  readonly reproduction?: ReproductionRecording | null;
  /** Elements the user inspected with the picker (S3-13); `null`/absent when none were picked. */
  readonly elementInspections?: readonly CaptureElementInspection[] | null;
}

/** Runtime message: overlay → service worker, asking it to capture + crop a picked element (S3-13). */
export const CROP_ELEMENT = 'bugcase/crop-element';

export interface CropElementRequest extends CropElementPayload {
  readonly type: typeof CROP_ELEMENT;
}

export type CropElementResult = CropElementResponse;

export function isCropElementRequest(value: unknown): value is CropElementRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === CROP_ELEMENT
  );
}

/**
 * Serializable capture result. The worker assembles + holds the report (binary assets stay in the
 * worker) and returns the JSON report + a `reportId` so the overlay can preview it, then ask the
 * worker to ZIP + download via FINALIZE_REPORT. `ok` is false on a handled failure.
 */
export interface CaptureReportResponse {
  readonly ok: boolean;
  /** Identifier for the report held in the worker; passed back on FINALIZE_REPORT. */
  readonly reportId?: string;
  /** The assembled report (JSON only; binary assets stay held in the worker). */
  readonly report?: BugReportV1;
  /** Byte sizes for binary artifacts the report only references (screenshot, DOM). */
  readonly assetSizes?: Partial<Record<ArtifactId, number>>;
  readonly reason?: string;
}

/** Runtime message: overlay → service worker, asking it to ZIP + download a held report. */
export const FINALIZE_REPORT = 'bugcase/finalize-report';

/**
 * Flattened annotations for the finalize step (S3-10). Konva can only rasterize in the overlay, so the
 * annotated PNG rides along as a data URL; the worker rehydrates it and replaces the screenshot blob.
 */
export interface FinalizeAnnotationPayload {
  readonly konvaJson: string;
  readonly screenshotDataUrl: string;
}

export interface FinalizeReportRequest {
  readonly type: typeof FINALIZE_REPORT;
  /** The `reportId` returned by CAPTURE_REPORT. */
  readonly reportId: string;
  /** Artifacts the user chose to exclude; their sections + files are dropped before zipping. */
  readonly removedIds: readonly ArtifactId[];
  /** Present when the user annotated the screenshot; folded into the ZIP at finalize. */
  readonly annotation?: FinalizeAnnotationPayload;
}

/** Serializable finalize result; `ok` is false on a handled failure (including `expired`). */
export interface FinalizeReportResponse {
  readonly ok: boolean;
  readonly downloadId?: number;
  readonly filename?: string;
  /** Final ZIP size in bytes; used by the preview to record report history (S3-07). */
  readonly byteSize?: number;
  readonly reason?: string;
}

/** Map a `finalizeReport` result to the serializable message response, omitting absent optionals. */
export function finalizeResponseFrom(result: CaptureFlowResult): FinalizeReportResponse {
  return {
    ok: result.ok,
    ...(result.downloadId !== undefined ? { downloadId: result.downloadId } : {}),
    ...(result.filename ? { filename: result.filename } : {}),
    ...(result.byteSize !== undefined ? { byteSize: result.byteSize } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

/**
 * Long-lived port name: the overlay opens this while a report is held for preview/annotation so the
 * MV3 service worker isn't evicted mid-session (which would drop the in-memory hold → an "expired"
 * download). The connection + its pings reset the worker's idle timer; the SW accepts it in onConnect.
 */
export const KEEPALIVE_PORT_NAME = 'bugcase/keepalive';

/** Runtime message: overlay → service worker, asking for a held report's asset as a data URL. */
export const PEEK_REPORT_ASSET = 'bugcase/peek-report-asset';

export interface PeekReportAssetRequest {
  readonly type: typeof PEEK_REPORT_ASSET;
  /** The `reportId` returned by CAPTURE_REPORT. */
  readonly reportId: string;
  /** Canonical ZIP path of the asset to read (e.g. a `ScreenshotRef.path`). */
  readonly path: string;
}

/** Serializable peek result; `ok` is false on a handled failure (`expired` / `not-found`). */
export interface PeekReportAssetResponse {
  readonly ok: boolean;
  readonly dataUrl?: string;
  readonly reason?: string;
}

/**
 * Runtime message: service worker → tab, signalling that the on-demand `chrome.debugger` session
 * is attached (`active: true`) or detached (`active: false`). The overlay shows a banner while active.
 */
export const DEBUGGER_ACTIVITY = 'bugcase/debugger-activity';

export interface DebuggerActivityMessage {
  readonly type: typeof DEBUGGER_ACTIVITY;
  readonly active: boolean;
  readonly hostName?: string;
}

/** Union of all messages the service worker understands (grows in later tickets). */
export type ExtensionMessage =
  | CaptureVisibleTabRequest
  | OverlayInjectRequest
  | CaptureReportRequest
  | FinalizeReportRequest
  | PeekReportAssetRequest
  | DebuggerActivityMessage;

export function isCaptureVisibleTabRequest(value: unknown): value is CaptureVisibleTabRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === CAPTURE_VISIBLE_TAB
  );
}

export function isOverlayInjectRequest(value: unknown): value is OverlayInjectRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === OVERLAY_INJECT
  );
}

export function isCaptureReportRequest(value: unknown): value is CaptureReportRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === CAPTURE_REPORT
  );
}

export function isFinalizeReportRequest(value: unknown): value is FinalizeReportRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === FINALIZE_REPORT
  );
}

export function isPeekReportAssetRequest(value: unknown): value is PeekReportAssetRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === PEEK_REPORT_ASSET
  );
}

export function isDebuggerActivityMessage(value: unknown): value is DebuggerActivityMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === DEBUGGER_ACTIVITY
  );
}
