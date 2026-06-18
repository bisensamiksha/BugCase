// MAIN-world content script, registered at document_start on allowlisted origins
// (see background/content-script-registration.ts). It runs in the page's own JS world, so it can
// observe page globals that the isolated content-script world cannot. S2-03 established this
// injection point + idempotency guard; S2-05 installs the page-bridge client here so the isolated
// world can pull buffered data out. The console (S2-06) and network (S2-07) ring buffers register
// their flush providers on this client.

import { installPageBridgeClient, type PageBridgeClient } from './page-bridge-client';

/** Window flag marking that the MAIN-world script has installed, so a re-injection is a no-op. */
export const PASSIVE_MAIN_INSTALLED_FLAG = '__bugcasePassiveMainInstalled';

/** The MAIN-world bridge responder, available to ring buffers once this entry has installed. */
let pageBridgeClient: PageBridgeClient | undefined;

/** Accessor for the installed bridge client (e.g. S2-06/S2-07 register flush providers on it). */
export function getPageBridgeClient(): PageBridgeClient | undefined {
  return pageBridgeClient;
}

/**
 * Install the MAIN-world passive-monitoring entry on `win`. Returns `true` if it installed now,
 * `false` if it was already installed (document_start scripts can run more than once per page —
 * e.g. same-document navigations — and must not double-install).
 */
export function installPassiveMainWorld(win: Window): boolean {
  const flags = win as unknown as Record<string, unknown>;
  if (flags[PASSIVE_MAIN_INSTALLED_FLAG]) {
    return false;
  }
  flags[PASSIVE_MAIN_INSTALLED_FLAG] = true;
  return true;
}

// Self-install when injected into a page. Guarded so importing the module in a non-DOM context
// (e.g. a node test) is side-effect free. The bridge client is installed only on first injection.
if (typeof window !== 'undefined' && installPassiveMainWorld(window)) {
  pageBridgeClient = installPageBridgeClient(window);
}
