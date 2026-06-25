/**
 * In-page localStorage/sessionStorage reader (S2-18).
 *
 * Run in the page via `chrome.scripting.executeScript({ world: 'MAIN', func: readPageStorage })`,
 * which serializes the function — so it must be self-contained (no imports; `window` default).
 * Each area is read inside its own try/catch because reading `window.localStorage` throws when
 * storage is disabled or the document is sandboxed; that area then resolves to `null`. Values are
 * truncated and entry counts capped in-page to bound what crosses the executeScript boundary;
 * `sizeBytes` reports the original (pre-truncation) UTF-8 byte length. Value masking is applied
 * later by the collector (`../capture/page-storage`), not here.
 */

export interface RawStorageEntry {
  readonly key: string;
  readonly value: string;
  readonly sizeBytes: number;
}

export interface RawPageStorage {
  readonly localStorage: readonly RawStorageEntry[] | null;
  readonly sessionStorage: readonly RawStorageEntry[] | null;
}

export function readPageStorage(
  win: Pick<Window, 'localStorage' | 'sessionStorage'> = window,
): RawPageStorage {
  // These caps mirror STORAGE_MAX_ENTRIES / the truncation length in ../capture/page-storage.
  // Duplicated as literals because this function is serialized into the page and cannot import.
  const MAX_ENTRIES = 500;
  const MAX_VALUE_LENGTH = 8192;

  const readArea = (store: Storage): RawStorageEntry[] => {
    const entries: RawStorageEntry[] = [];
    const count = Math.min(store.length, MAX_ENTRIES);
    for (let i = 0; i < count; i += 1) {
      const key = store.key(i);
      if (key === null) {
        continue;
      }
      const raw = store.getItem(key) ?? '';
      const sizeBytes = new TextEncoder().encode(raw).length;
      const value = raw.length > MAX_VALUE_LENGTH ? raw.slice(0, MAX_VALUE_LENGTH) : raw;
      entries.push({ key, value, sizeBytes });
    }
    return entries;
  };

  const safeRead = (read: () => Storage): RawStorageEntry[] | null => {
    try {
      return readArea(read());
    } catch {
      return null;
    }
  };

  return {
    localStorage: safeRead(() => win.localStorage),
    sessionStorage: safeRead(() => win.sessionStorage),
  };
}
