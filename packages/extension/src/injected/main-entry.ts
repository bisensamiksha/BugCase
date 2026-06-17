// MAIN-world content script, registered at document_start on allowlisted origins
// (see background/content-script-registration.ts). It runs in the page's own JS world, so it can
// observe page globals that the isolated content-script world cannot. S2-03 only establishes this
// injection point and its idempotency guard; the passive console (S2-04) and network (S2-05) ring
// buffers hook in here, and the cross-world bridge to the worker arrives in S2-07.

/** Window flag marking that the MAIN-world script has installed, so a re-injection is a no-op. */
export const PASSIVE_MAIN_INSTALLED_FLAG = '__bugcasePassiveMainInstalled';

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
// (e.g. a node test) is side-effect free.
if (typeof window !== 'undefined') {
  installPassiveMainWorld(window);
}
