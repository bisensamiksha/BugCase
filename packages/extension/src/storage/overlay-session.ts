/**
 * Durable "the overlay is open in this tab" flag (BUG-05).
 *
 * The overlay host lives in the page's DOM, so any navigation destroys it. Without a record that the
 * user had it open, the worker cannot tell "the page navigated out from under the overlay" from "the
 * overlay was never opened" — so a page that self-navigates right after injection silently loses the
 * overlay and looks like the toolbar button did nothing.
 *
 * The flag is kept in `chrome.storage.session`, keyed by tab, so it survives the navigation and a
 * service-worker eviction. Only the service worker (a trusted context) touches this area. Defensive,
 * mirroring recording-session.ts.
 */

import browser from '../lib/browser';

/** The slice of a `chrome.storage` area we depend on (promise-style via webextension-polyfill). */
export interface OverlayStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

export interface OverlaySessionDeps {
  /** Defaults to `browser.storage.session`; injected in tests. */
  readonly storage?: OverlayStorageArea;
}

const KEY_PREFIX = 'bugcase/overlay-open:';

/** Stored marker. A literal keeps a stray value from reading as "open". */
const OPEN_MARKER = 'open';

function keyFor(tabId: number): string {
  return `${KEY_PREFIX}${tabId}`;
}

function area(deps: OverlaySessionDeps): OverlayStorageArea {
  return deps.storage ?? (browser.storage as unknown as { session: OverlayStorageArea }).session;
}

export async function isOverlayOpen(
  tabId: number,
  deps: OverlaySessionDeps = {},
): Promise<boolean> {
  try {
    const key = keyFor(tabId);
    const record = await area(deps).get(key);
    return record[key] === OPEN_MARKER;
  } catch {
    return false;
  }
}

export async function setOverlayOpen(tabId: number, deps: OverlaySessionDeps = {}): Promise<void> {
  try {
    await area(deps).set({ [keyFor(tabId)]: OPEN_MARKER });
  } catch {
    // A failed persist must not break opening the overlay; it only costs the re-mount on navigation.
  }
}

export async function clearOverlayOpen(
  tabId: number,
  deps: OverlaySessionDeps = {},
): Promise<void> {
  try {
    await area(deps).remove(keyFor(tabId));
  } catch {
    // ignore
  }
}
