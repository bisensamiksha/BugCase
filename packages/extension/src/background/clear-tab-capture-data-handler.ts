/**
 * Service-worker message handler for wiping a tab's captured data on overlay close (BUG-06 follow-up).
 *
 * The overlay runs in a page's isolated world and can't reach `chrome.storage.session` directly, so
 * `removeOverlay` (content/overlay-root.tsx) relays the wipe over this message instead of calling the
 * three storage modules itself. Keyed by the sender's tab — mirrors overlay-draft-handler.ts and
 * recording-handler.ts.
 */

import { clearTabCaptureData, type ClearTabCaptureDataDeps } from './clear-tab-capture-data';

export const CLEAR_TAB_CAPTURE_DATA = 'bugcase/clear-tab-capture-data';

export interface ClearTabCaptureDataRequest {
  readonly type: typeof CLEAR_TAB_CAPTURE_DATA;
}

export interface ClearTabCaptureDataResponse {
  readonly ok: boolean;
}

export function isClearTabCaptureDataRequest(value: unknown): value is ClearTabCaptureDataRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === CLEAR_TAB_CAPTURE_DATA
  );
}

export async function handleClearTabCaptureDataRequest(
  message: ClearTabCaptureDataRequest,
  tabId: number | undefined,
  deps: ClearTabCaptureDataDeps = {},
): Promise<ClearTabCaptureDataResponse> {
  if (tabId === undefined) {
    return { ok: false };
  }
  await clearTabCaptureData(tabId, deps);
  return { ok: true };
}
