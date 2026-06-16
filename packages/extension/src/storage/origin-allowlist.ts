import browser from '../lib/browser';

/** `chrome.storage.local` key holding the array of origins opted into passive monitoring. */
export const ORIGIN_ALLOWLIST_STORAGE_KEY = 'bugcase/passive-monitoring-origins';

/** The slice of a `chrome.storage` area we depend on (promise-style via webextension-polyfill). */
export interface AllowlistStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface OriginAllowlistDeps {
  /** Defaults to `browser.storage.local`; injected in tests. */
  readonly storage?: AllowlistStorageArea;
}

function area(deps: OriginAllowlistDeps): AllowlistStorageArea {
  return deps.storage ?? browser.storage.local;
}

/**
 * Reduce a URL or origin string to a canonical http(s) origin (e.g. `https://example.com`).
 * Returns `null` for non-http(s) schemes (file:, about:, chrome-extension:, …) and malformed
 * input — passive monitoring only ever applies to real web origins.
 */
export function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Read the allowlist. Resolves `[]` on missing/malformed data or any storage rejection. */
export async function getAllowedOrigins(deps: OriginAllowlistDeps = {}): Promise<string[]> {
  try {
    const stored = await area(deps).get(ORIGIN_ALLOWLIST_STORAGE_KEY);
    const value = stored[ORIGIN_ALLOWLIST_STORAGE_KEY];
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

/** Whether `origin` (URL or origin string) is opted into passive monitoring. */
export async function isOriginAllowed(
  origin: string,
  deps: OriginAllowlistDeps = {},
): Promise<boolean> {
  const normalized = normalizeOrigin(origin);
  if (normalized === null) {
    return false;
  }
  const origins = await getAllowedOrigins(deps);
  return origins.includes(normalized);
}

/**
 * Add `origin` to the allowlist (normalized, sorted, de-duplicated) and persist it.
 * Returns the resulting list; a no-op (returns the current list) for invalid origins,
 * already-present origins, or a storage write failure.
 */
export async function addAllowedOrigin(
  origin: string,
  deps: OriginAllowlistDeps = {},
): Promise<string[]> {
  const normalized = normalizeOrigin(origin);
  const current = await getAllowedOrigins(deps);
  if (normalized === null || current.includes(normalized)) {
    return current;
  }
  const next = [...current, normalized].sort();
  try {
    await area(deps).set({ [ORIGIN_ALLOWLIST_STORAGE_KEY]: next });
  } catch {
    return current;
  }
  return next;
}

/**
 * Remove `origin` from the allowlist and persist the result. Returns the resulting list;
 * a no-op (returns the current list) for invalid/absent origins or a storage write failure.
 */
export async function removeAllowedOrigin(
  origin: string,
  deps: OriginAllowlistDeps = {},
): Promise<string[]> {
  const normalized = normalizeOrigin(origin);
  const current = await getAllowedOrigins(deps);
  if (normalized === null || !current.includes(normalized)) {
    return current;
  }
  const next = current.filter((entry) => entry !== normalized);
  try {
    await area(deps).set({ [ORIGIN_ALLOWLIST_STORAGE_KEY]: next });
  } catch {
    return current;
  }
  return next;
}
