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

/** Union of all messages the service worker understands (grows in later tickets). */
export type ExtensionMessage = CaptureVisibleTabRequest;

export function isCaptureVisibleTabRequest(value: unknown): value is CaptureVisibleTabRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === CAPTURE_VISIBLE_TAB
  );
}
