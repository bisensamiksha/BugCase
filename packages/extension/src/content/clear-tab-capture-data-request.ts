/**
 * Ask the service worker to wipe this tab's captured data on overlay close (BUG-06 follow-up).
 *
 * The overlay's own × buttons, the toolbar icon, and the post-download close all route through
 * `removeOverlay` (overlay-root.tsx), which sends this alongside its `reportOverlayState(false)` call.
 * The worker persists the draft/recording/passive-error stores (see clear-tab-capture-data-handler.ts),
 * which this content script can't reach directly.
 *
 * Best-effort by design, mirroring overlay-state-report.ts: a missing receiver (worker asleep,
 * extension reloading) must never break closing the overlay, so both a synchronous throw and a
 * rejected send are swallowed.
 */

import {
  CLEAR_TAB_CAPTURE_DATA,
  type ClearTabCaptureDataRequest,
  type ClearTabCaptureDataResponse,
} from '../background/clear-tab-capture-data-handler';
import browser from '../lib/browser';

export type SendClearTabCaptureData = (
  message: ClearTabCaptureDataRequest,
) => Promise<ClearTabCaptureDataResponse>;

const defaultSend: SendClearTabCaptureData = (message) => browser.runtime.sendMessage(message);

export function requestClearTabCaptureData(send: SendClearTabCaptureData = defaultSend): void {
  try {
    void send({ type: CLEAR_TAB_CAPTURE_DATA }).catch(() => {
      // No receiver (worker asleep / extension reloading); the overlay still closes.
    });
  } catch {
    // sendMessage threw synchronously (context invalidated); nothing to do.
  }
}
