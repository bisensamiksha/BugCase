import type { BrowserInfo, CaptureMetadata, UserInput } from '@bugcase/schema';

import type { VisibleTabCapture } from '../capture/capture-visible-tab';

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
}

/** Serializable capture-flow result; `ok` is false on a handled failure. */
export interface CaptureReportResponse {
  readonly ok: boolean;
  readonly downloadId?: number;
  readonly filename?: string;
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

export function isDebuggerActivityMessage(value: unknown): value is DebuggerActivityMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === DEBUGGER_ACTIVITY
  );
}
