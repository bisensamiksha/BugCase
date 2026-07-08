// Isolated-world bridge bootstrap, registered at document_start on allowlisted origins alongside the
// MAIN-world entry (see background/content-script-registration.ts). It runs in the extension's
// isolated content-script world, which can reach `chrome.runtime` to relay data to the service
// worker — the page world cannot. S2-03 established this bootstrap + idempotency guard; S2-05 creates
// the page bridge here (window.postMessage + verifier-token channel to the MAIN world) and exposes
// its `flush` API for the service-worker-triggered capture in later tickets.

import { PASSIVE_ERROR, type PassiveErrorRequest } from '../background/messages';
import browser from '../lib/browser';
import { isPassiveError } from '../shared/bridge-protocol';

import { createPageBridge, type PageBridge } from './page-bridge';

/** Window flag marking that the bridge has bootstrapped, so a re-injection is a no-op. */
export const PASSIVE_BRIDGE_INSTALLED_FLAG = '__bugcasePassiveBridgeInstalled';

/** The isolated-world bridge, available to the capture flow once this bootstrap has run. */
let pageBridge: PageBridge | undefined;

/** Accessor for the page bridge (later tickets call `getPageBridge()?.flush(channel)`). */
export function getPageBridge(): PageBridge | undefined {
  return pageBridge;
}

/**
 * Bootstrap the isolated-world bridge on `win`. Returns `true` if it installed now, `false` if it
 * was already installed (document_start scripts can run more than once per page and must not
 * double-install).
 */
export function installPassiveBridge(win: Window): boolean {
  const flags = win as unknown as Record<string, unknown>;
  if (flags[PASSIVE_BRIDGE_INSTALLED_FLAG]) {
    return false;
  }
  flags[PASSIVE_BRIDGE_INSTALLED_FLAG] = true;
  return true;
}

/**
 * Relay MAIN-world passive-error signals (S3-14) to the service worker. The MAIN world posts a
 * source-tagged `passive-error` on each uncaught error; only the isolated world can reach
 * `chrome.runtime`, so it forwards a `PASSIVE_ERROR` (the worker reads the sending tab from the
 * message sender). Best-effort — a page that never errors sends nothing; a failed relay never throws.
 * Returns a disposer for tests. `send` is injectable so the relay is unit-tested without the runtime.
 */
export function installPassiveErrorRelay(
  win: Window,
  send: (message: PassiveErrorRequest) => void,
): () => void {
  const onMessage = (event: MessageEvent): void => {
    if (!isPassiveError(event.data)) {
      return;
    }
    try {
      send({ type: PASSIVE_ERROR });
    } catch {
      // Best-effort: relaying the badge signal must never throw in the page.
    }
  };
  win.addEventListener('message', onMessage as EventListener);
  return () => win.removeEventListener('message', onMessage as EventListener);
}

// Self-install when injected into a page. Guarded so importing the module in a non-DOM context
// (e.g. a node test) is side-effect free. The bridge is created only on first injection.
if (typeof window !== 'undefined' && installPassiveBridge(window)) {
  pageBridge = createPageBridge(window);
  installPassiveErrorRelay(window, (message) => {
    void browser.runtime.sendMessage(message).catch(() => {
      // The worker may be asleep or the tab restricted; the badge signal is non-critical.
    });
  });
}
