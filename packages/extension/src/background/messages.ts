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

/**
 * Runtime message: overlay → service worker, asking it to inject the on-demand annotation surface
 * (TD-03). Only the service worker can `executeScript` a packaged file, so the overlay routes the
 * inject through it; the reply reuses {@link OverlayInjectResponse}.
 */
export const INJECT_ANNOTATION = 'bugcase/inject-annotation';

export interface InjectAnnotationRequest {
  readonly type: typeof INJECT_ANNOTATION;
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

/** Passive error badge (S3-14): page → SW, "an uncaught error just happened on my tab". */
export const PASSIVE_ERROR = 'bugcase/passive-error';

export interface PassiveErrorRequest {
  readonly type: typeof PASSIVE_ERROR;
}

export function isPassiveErrorRequest(value: unknown): value is PassiveErrorRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === PASSIVE_ERROR
  );
}

/** Overlay → SW: dismiss (clear) the passive error badge for the sending tab. */
export const DISMISS_ERROR_BADGE = 'bugcase/dismiss-error-badge';

export interface DismissErrorBadgeRequest {
  readonly type: typeof DISMISS_ERROR_BADGE;
}

export function isDismissErrorBadgeRequest(value: unknown): value is DismissErrorBadgeRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === DISMISS_ERROR_BADGE
  );
}

/** Overlay → SW: read the current passive error count for the sending tab (drives the dismiss UI). */
export const GET_PASSIVE_ERROR_COUNT = 'bugcase/get-passive-error-count';

export interface GetPassiveErrorCountRequest {
  readonly type: typeof GET_PASSIVE_ERROR_COUNT;
}

export interface GetPassiveErrorCountResponse {
  readonly count: number;
}

export function isGetPassiveErrorCountRequest(
  value: unknown,
): value is GetPassiveErrorCountRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === GET_PASSIVE_ERROR_COUNT
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
  /**
   * The flattened annotated PNG as a data URL. Omitted when it's too large for a single message — it's
   * streamed first via FINALIZE_ANNOTATION_CHUNK and the worker reassembles it (BUG-03).
   */
  readonly screenshotDataUrl?: string;
}

/**
 * Runtime message: streams one sub-64MiB slice of a large annotated screenshot's data URL ahead of
 * FINALIZE_REPORT (Chrome caps `runtime.sendMessage` at 64 MiB). The worker buffers the slices by
 * `reportId` and reassembles them at finalize (BUG-03).
 */
export const FINALIZE_ANNOTATION_CHUNK = 'bugcase/finalize-annotation-chunk';

export interface FinalizeAnnotationChunkRequest {
  readonly type: typeof FINALIZE_ANNOTATION_CHUNK;
  readonly reportId: string;
  /** 0-based index of this slice. */
  readonly seq: number;
  /** Total number of slices that make up the screenshot. */
  readonly total: number;
  /** This slice of the screenshot data URL. */
  readonly chunk: string;
}

export interface FinalizeAnnotationChunkResponse {
  readonly ok: boolean;
  readonly reason?: string;
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
  | InjectAnnotationRequest
  | CaptureReportRequest
  | FinalizeReportRequest
  | FinalizeAnnotationChunkRequest
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

export function isInjectAnnotationRequest(value: unknown): value is InjectAnnotationRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === INJECT_ANNOTATION
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

export function isFinalizeAnnotationChunkRequest(
  value: unknown,
): value is FinalizeAnnotationChunkRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === FINALIZE_ANNOTATION_CHUNK
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
