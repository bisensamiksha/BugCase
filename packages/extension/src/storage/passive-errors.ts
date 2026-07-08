/**
 * Per-tab passive error count (S3-14).
 *
 * The passive error badge counts uncaught JS errors on a page. The count lives in
 * `chrome.storage.session`, keyed by tab, so it survives a service-worker eviction between errors (the
 * badge itself persists on the tab until we change it, but the count must be durable to keep
 * incrementing correctly). Only the service worker touches this. Defensive, mirroring recording-session.
 */

import browser from '../lib/browser';

export interface PassiveErrorsStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

export interface PassiveErrorsDeps {
  /** Defaults to `browser.storage.session`; injected in tests. */
  readonly storage?: PassiveErrorsStorageArea;
}

const KEY_PREFIX = 'bugcase/passive-errors:';

function keyFor(tabId: number): string {
  return `${KEY_PREFIX}${tabId}`;
}

function area(deps: PassiveErrorsDeps): PassiveErrorsStorageArea {
  return (
    deps.storage ?? (browser.storage as unknown as { session: PassiveErrorsStorageArea }).session
  );
}

function coerceCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export async function getPassiveErrorCount(
  tabId: number,
  deps: PassiveErrorsDeps = {},
): Promise<number> {
  try {
    const key = keyFor(tabId);
    const record = await area(deps).get(key);
    return coerceCount(record[key]);
  } catch {
    return 0;
  }
}

export async function incrementPassiveErrorCount(
  tabId: number,
  deps: PassiveErrorsDeps = {},
): Promise<number> {
  const next = (await getPassiveErrorCount(tabId, deps)) + 1;
  try {
    await area(deps).set({ [keyFor(tabId)]: next });
  } catch {
    // A failed persist must not break error handling; the badge may just lag by one.
  }
  return next;
}

export async function clearPassiveErrorCount(
  tabId: number,
  deps: PassiveErrorsDeps = {},
): Promise<void> {
  try {
    await area(deps).remove(keyFor(tabId));
  } catch {
    // ignore
  }
}
