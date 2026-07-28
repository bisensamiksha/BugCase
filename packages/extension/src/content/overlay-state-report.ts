/**
 * Report the overlay's mounted state to the service worker (BUG-05).
 *
 * Injection toggles the overlay and the user can close it from its own UI, so only the page knows the
 * resulting state. The worker needs it to decide whether to re-mount the overlay after a navigation.
 *
 * Best-effort by design: the report is a hint that costs, at worst, one missed re-mount. It must never
 * break the overlay, so a missing receiver (worker asleep, extension reloading) is swallowed — both
 * when `sendMessage` throws synchronously and when it rejects.
 */

import { OVERLAY_STATE, type OverlayStateRequest } from '../background/messages';
import browser from '../lib/browser';

export type SendOverlayState = (message: OverlayStateRequest) => Promise<unknown>;

const defaultSend: SendOverlayState = (message) => browser.runtime.sendMessage(message);

export function reportOverlayState(mounted: boolean, send: SendOverlayState = defaultSend): void {
  try {
    void send({ type: OVERLAY_STATE, mounted }).catch(() => {
      // No receiver (worker asleep / extension reloading); the overlay still works.
    });
  } catch {
    // sendMessage threw synchronously (context invalidated); nothing to do.
  }
}
