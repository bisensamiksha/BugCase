import { describe, expect, it, vi } from 'vitest';

// Importing lib/browser pulls in the polyfill; the storage area is injected in every test.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  clearPassiveErrorCount,
  getPassiveErrorCount,
  incrementPassiveErrorCount,
  type PassiveErrorsStorageArea,
} from './passive-errors';

function fakeStorage(): PassiveErrorsStorageArea & { data: Record<string, unknown> } {
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

describe('passive-errors storage', () => {
  it('returns 0 when no count is stored for the tab', async () => {
    expect(await getPassiveErrorCount(7, { storage: fakeStorage() })).toBe(0);
  });

  it('increments and returns the new count', async () => {
    const storage = fakeStorage();
    expect(await incrementPassiveErrorCount(7, { storage })).toBe(1);
    expect(await incrementPassiveErrorCount(7, { storage })).toBe(2);
    expect(await getPassiveErrorCount(7, { storage })).toBe(2);
  });

  it('keeps counts per tab', async () => {
    const storage = fakeStorage();
    await incrementPassiveErrorCount(1, { storage });
    await incrementPassiveErrorCount(2, { storage });
    await incrementPassiveErrorCount(2, { storage });
    expect(await getPassiveErrorCount(1, { storage })).toBe(1);
    expect(await getPassiveErrorCount(2, { storage })).toBe(2);
  });

  it('clears a tab count', async () => {
    const storage = fakeStorage();
    await incrementPassiveErrorCount(7, { storage });
    await clearPassiveErrorCount(7, { storage });
    expect(await getPassiveErrorCount(7, { storage })).toBe(0);
  });

  it('treats a malformed stored value as 0', async () => {
    const storage = fakeStorage();
    storage.data['bugcase/passive-errors:7'] = 'nonsense';
    expect(await getPassiveErrorCount(7, { storage })).toBe(0);
  });
});
