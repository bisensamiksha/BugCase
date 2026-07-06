/**
 * Overlay → MAIN-world recorder control relay (S3-12).
 *
 * The overlay runs in the isolated content-script world; the reproduction recorder runs in the page's
 * MAIN world. They share the page's `window`, so a `recorder-control` message posted here reaches the
 * recorder's control listener. This is deliberately NOT a flush (see `bridge-protocol.ts`): it carries
 * no captured data and must not pin the capture-time flush token.
 */

import { createRecorderControl, type RecorderControlMessage } from '../shared/bridge-protocol';

/** Minimal slice of `window` needed to post a control message. */
export interface ControlPostTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** Post an arm/disarm control to the MAIN-world recorder. No-ops (never throws) without a window. */
export function sendRecorderControl(
  win: ControlPostTarget | undefined,
  action: RecorderControlMessage['action'],
  token: string,
): void {
  try {
    win?.postMessage(createRecorderControl(action, token), '*');
  } catch {
    // Best-effort control; a hostile page overriding postMessage must not break the overlay.
  }
}
