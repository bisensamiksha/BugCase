import { describe, expect, it, vi } from 'vitest';

// The storage area is injected in every test, but importing lib/browser pulls in the polyfill; stub it.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  clearOverlayOpen,
  isOverlayOpen,
  setOverlayOpen,
  type OverlayStorageArea,
} from './overlay-session';

function fakeStorage(): OverlayStorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: (key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (items: Record<string, unknown>) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
    remove: (key: string) => {
      delete data[key];
      return Promise.resolve();
    },
  };
}

describe('overlay-session storage', () => {
  it('reports the overlay as closed when nothing is stored for the tab', async () => {
    const storage = fakeStorage();
    expect(await isOverlayOpen(7, { storage })).toBe(false);
  });

  it('reports the overlay as open after it is marked open', async () => {
    const storage = fakeStorage();
    await setOverlayOpen(7, { storage });
    expect(await isOverlayOpen(7, { storage })).toBe(true);
  });

  it('reports the overlay as closed after it is cleared', async () => {
    const storage = fakeStorage();
    await setOverlayOpen(7, { storage });
    await clearOverlayOpen(7, { storage });
    expect(await isOverlayOpen(7, { storage })).toBe(false);
  });

  it('keeps overlay state separate per tab', async () => {
    const storage = fakeStorage();
    await setOverlayOpen(7, { storage });
    expect(await isOverlayOpen(8, { storage })).toBe(false);
  });

  it('reports closed rather than throwing when storage reads fail', async () => {
    const storage: OverlayStorageArea = {
      get: () => Promise.reject(new Error('storage unavailable')),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    expect(await isOverlayOpen(7, { storage })).toBe(false);
  });

  it('does not throw when storage writes fail', async () => {
    const storage: OverlayStorageArea = {
      get: () => Promise.resolve({}),
      set: () => Promise.reject(new Error('storage unavailable')),
      remove: () => Promise.reject(new Error('storage unavailable')),
    };
    await expect(setOverlayOpen(7, { storage })).resolves.toBeUndefined();
    await expect(clearOverlayOpen(7, { storage })).resolves.toBeUndefined();
  });

  it('ignores a stored value that is not the open marker', async () => {
    const storage = fakeStorage();
    storage.data['bugcase/overlay-open:7'] = 'nonsense';
    expect(await isOverlayOpen(7, { storage })).toBe(false);
  });
});
