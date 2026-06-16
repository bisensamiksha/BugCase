import { describe, expect, it, vi } from 'vitest';

// The module transitively imports lib/browser; stub the polyfill so the import succeeds in node.
// Every test injects a fake storage area, so the real browser.storage is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  ORIGIN_ALLOWLIST_STORAGE_KEY,
  addAllowedOrigin,
  getAllowedOrigins,
  isOriginAllowed,
  normalizeOrigin,
  removeAllowedOrigin,
  type AllowlistStorageArea,
} from './origin-allowlist';

/** In-memory `chrome.storage.local`-shaped area for deterministic tests. */
function fakeStorage(
  initial: Record<string, unknown> = {},
): AllowlistStorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: (key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (items: Record<string, unknown>) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
  };
}

describe('normalizeOrigin', () => {
  it('reduces a full URL to its origin', () => {
    expect(normalizeOrigin('https://example.com/path?q=1#h')).toBe('https://example.com');
  });

  it('keeps a bare origin and strips the default port', () => {
    expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
    expect(normalizeOrigin('https://example.com:443')).toBe('https://example.com');
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rejects non-http(s) and malformed input', () => {
    expect(normalizeOrigin('file:///etc/passwd')).toBeNull();
    expect(normalizeOrigin('about:blank')).toBeNull();
    expect(normalizeOrigin('chrome-extension://abc')).toBeNull();
    expect(normalizeOrigin('not a url')).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
  });
});

describe('getAllowedOrigins', () => {
  it('returns an empty list when nothing is stored', async () => {
    await expect(getAllowedOrigins({ storage: fakeStorage() })).resolves.toEqual([]);
  });

  it('returns the stored origins', async () => {
    const storage = fakeStorage({
      [ORIGIN_ALLOWLIST_STORAGE_KEY]: ['https://a.com', 'https://b.com'],
    });
    await expect(getAllowedOrigins({ storage })).resolves.toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('ignores a malformed (non-array / non-string) stored value', async () => {
    await expect(
      getAllowedOrigins({ storage: fakeStorage({ [ORIGIN_ALLOWLIST_STORAGE_KEY]: 'oops' }) }),
    ).resolves.toEqual([]);
    await expect(
      getAllowedOrigins({
        storage: fakeStorage({ [ORIGIN_ALLOWLIST_STORAGE_KEY]: [1, 'https://a.com', null] }),
      }),
    ).resolves.toEqual(['https://a.com']);
  });

  it('returns an empty list when the storage area throws', async () => {
    const storage: AllowlistStorageArea = {
      get: () => Promise.reject(new Error('boom')),
      set: () => Promise.resolve(),
    };
    await expect(getAllowedOrigins({ storage })).resolves.toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  it('is true for a stored origin and normalizes the query input', async () => {
    const storage = fakeStorage({ [ORIGIN_ALLOWLIST_STORAGE_KEY]: ['https://example.com'] });
    await expect(isOriginAllowed('https://example.com/some/page', { storage })).resolves.toBe(true);
  });

  it('is false for an origin that is not stored', async () => {
    const storage = fakeStorage({ [ORIGIN_ALLOWLIST_STORAGE_KEY]: ['https://example.com'] });
    await expect(isOriginAllowed('https://other.com', { storage })).resolves.toBe(false);
  });

  it('is false for invalid input', async () => {
    await expect(isOriginAllowed('about:blank', { storage: fakeStorage() })).resolves.toBe(false);
  });
});

describe('addAllowedOrigin', () => {
  it('adds, normalizes, and persists a new origin', async () => {
    const storage = fakeStorage();
    const result = await addAllowedOrigin('https://example.com/login', { storage });
    expect(result).toEqual(['https://example.com']);
    expect(storage.data[ORIGIN_ALLOWLIST_STORAGE_KEY]).toEqual(['https://example.com']);
  });

  it('keeps the list sorted and de-duplicated', async () => {
    const storage = fakeStorage({ [ORIGIN_ALLOWLIST_STORAGE_KEY]: ['https://b.com'] });
    await addAllowedOrigin('https://a.com', { storage });
    const result = await addAllowedOrigin('https://b.com', { storage });
    expect(result).toEqual(['https://a.com', 'https://b.com']);
  });

  it('ignores invalid origins without persisting', async () => {
    const storage = fakeStorage();
    const result = await addAllowedOrigin('about:blank', { storage });
    expect(result).toEqual([]);
    expect(storage.data[ORIGIN_ALLOWLIST_STORAGE_KEY]).toBeUndefined();
  });
});

describe('removeAllowedOrigin', () => {
  it('removes and persists an existing origin', async () => {
    const storage = fakeStorage({
      [ORIGIN_ALLOWLIST_STORAGE_KEY]: ['https://a.com', 'https://b.com'],
    });
    const result = await removeAllowedOrigin('https://a.com', { storage });
    expect(result).toEqual(['https://b.com']);
    expect(storage.data[ORIGIN_ALLOWLIST_STORAGE_KEY]).toEqual(['https://b.com']);
  });

  it('is a no-op when the origin is absent', async () => {
    const storage = fakeStorage({ [ORIGIN_ALLOWLIST_STORAGE_KEY]: ['https://a.com'] });
    const result = await removeAllowedOrigin('https://other.com', { storage });
    expect(result).toEqual(['https://a.com']);
  });
});
