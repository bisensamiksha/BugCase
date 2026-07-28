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

import {
  OVERLAY_STATE,
  QUERY_OVERLAY_STATE,
  type OverlayStateRequest,
  type QueryOverlayStateRequest,
} from '../background/messages';
import browser from '../lib/browser';

export type SendOverlayState = (message: OverlayStateRequest) => Promise<unknown>;
export type SendOverlayQuery = (message: QueryOverlayStateRequest) => Promise<unknown>;

const defaultSend: SendOverlayState = (message) => browser.runtime.sendMessage(message);

const defaultQuery: SendOverlayQuery = (message) => browser.runtime.sendMessage(message);

export function reportOverlayState(mounted: boolean, send: SendOverlayState = defaultSend): void {
  try {
    void send({ type: OVERLAY_STATE, mounted }).catch(() => {
      // No receiver (worker asleep / extension reloading); the overlay still works.
    });
  } catch {
    // sendMessage threw synchronously (context invalidated); nothing to do.
  }
}

/**
 * Ask the worker whether the overlay should be open in this tab.
 *
 * `null` means "don't know" (worker unreachable or a malformed reply) — callers must leave the page
 * as-is rather than guess, so a transient messaging failure can't rip away a working overlay.
 */
export async function queryOverlayOpen(
  send: SendOverlayQuery = defaultQuery,
): Promise<boolean | null> {
  try {
    const reply: unknown = await send({ type: QUERY_OVERLAY_STATE });
    if (typeof reply === 'object' && reply !== null) {
      const open = (reply as { open?: unknown }).open;
      if (typeof open === 'boolean') {
        return open;
      }
    }
    return null;
  } catch {
    return null;
  }
}
