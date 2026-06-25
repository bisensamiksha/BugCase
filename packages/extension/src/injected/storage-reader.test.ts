import { describe, expect, it } from 'vitest';

import { readPageStorage } from './storage-reader';

function fakeStorage(data: Record<string, string>): Storage {
  const keys = Object.keys(data);
  return {
    get length() {
      return keys.length;
    },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  } as Storage;
}

function fakeWindow(
  local: Storage,
  session: Storage,
): Pick<Window, 'localStorage' | 'sessionStorage'> {
  return { localStorage: local, sessionStorage: session };
}

describe('readPageStorage', () => {
  it('reads both areas into key/value/sizeBytes entries', () => {
    const win = fakeWindow(fakeStorage({ theme: 'dark' }), fakeStorage({ tab: '3' }));
    const result = readPageStorage(win);
    expect(result.localStorage).toEqual([{ key: 'theme', value: 'dark', sizeBytes: 4 }]);
    expect(result.sessionStorage).toEqual([{ key: 'tab', value: '3', sizeBytes: 1 }]);
  });

  it('reports sizeBytes as the original UTF-8 length even when the value is truncated', () => {
    const big = 'x'.repeat(9000);
    const win = fakeWindow(fakeStorage({ blob: big }), fakeStorage({}));
    const [entry] = readPageStorage(win).localStorage ?? [];
    expect(entry?.sizeBytes).toBe(9000);
    expect(entry?.value).toHaveLength(8192);
  });

  it('caps an area at 500 entries (insertion order)', () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < 600; i += 1) {
      data[`k${String(i).padStart(4, '0')}`] = 'v';
    }
    const win = fakeWindow(fakeStorage(data), fakeStorage({}));
    expect(readPageStorage(win).localStorage).toHaveLength(500);
  });

  it('treats a missing item as an empty string', () => {
    const store = {
      get length() {
        return 1;
      },
      key: () => 'ghost',
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    } as Storage;
    const win = fakeWindow(store, fakeStorage({}));
    expect(readPageStorage(win).localStorage).toEqual([{ key: 'ghost', value: '', sizeBytes: 0 }]);
  });

  it('returns null for an area whose access throws (storage disabled/sandboxed)', () => {
    const win = {
      get localStorage(): Storage {
        throw new Error('access denied');
      },
      sessionStorage: fakeStorage({ ok: '1' }),
    } as unknown as Pick<Window, 'localStorage' | 'sessionStorage'>;
    const result = readPageStorage(win);
    expect(result.localStorage).toBeNull();
    expect(result.sessionStorage).toEqual([{ key: 'ok', value: '1', sizeBytes: 1 }]);
  });

  it('returns empty arrays for empty areas', () => {
    const win = fakeWindow(fakeStorage({}), fakeStorage({}));
    expect(readPageStorage(win)).toEqual({ localStorage: [], sessionStorage: [] });
  });
});
