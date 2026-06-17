// Isolated-world bridge bootstrap, registered at document_start on allowlisted origins alongside the
// MAIN-world entry (see background/content-script-registration.ts). It runs in the extension's
// isolated content-script world, which can reach `chrome.runtime` to relay data to the service
// worker — the page world cannot. S2-03 only establishes this bootstrap and its idempotency guard;
// the window.postMessage + verifier-token channel to the MAIN world arrives in S2-07.

/** Window flag marking that the bridge has bootstrapped, so a re-injection is a no-op. */
export const PASSIVE_BRIDGE_INSTALLED_FLAG = '__bugcasePassiveBridgeInstalled';

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

// Self-install when injected into a page. Guarded so importing the module in a non-DOM context
// (e.g. a node test) is side-effect free.
if (typeof window !== 'undefined') {
  installPassiveBridge(window);
}
