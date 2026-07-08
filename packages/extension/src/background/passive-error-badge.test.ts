import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { PassiveErrorsStorageArea } from '../storage/passive-errors';

import {
  badgeText,
  clearPassiveErrorBadge,
  recordPassiveError,
  type BadgeAction,
} from './passive-error-badge';

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

function fakeAction(): BadgeAction & {
  setBadgeText: ReturnType<typeof vi.fn>;
  setBadgeBackgroundColor: ReturnType<typeof vi.fn>;
} {
  return {
    setBadgeText: vi.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
  };
}

describe('badgeText', () => {
  it('is empty at zero and caps at 9+', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(1)).toBe('1');
    expect(badgeText(9)).toBe('9');
    expect(badgeText(10)).toBe('9+');
    expect(badgeText(150)).toBe('9+');
  });
});

describe('recordPassiveError', () => {
  it('increments the tab count and sets the badge text', async () => {
    const storage = fakeStorage();
    const action = fakeAction();
    const count = await recordPassiveError(7, { storage, action });
    expect(count).toBe(1);
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '1', tabId: 7 });
    expect(action.setBadgeBackgroundColor).toHaveBeenCalled();
    await recordPassiveError(7, { storage, action });
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '2', tabId: 7 });
  });

  it('does nothing without a tab id', async () => {
    const action = fakeAction();
    await recordPassiveError(undefined, { storage: fakeStorage(), action });
    expect(action.setBadgeText).not.toHaveBeenCalled();
  });

  it('never throws when the action API fails', async () => {
    const action = {
      setBadgeText: vi.fn(() => Promise.reject(new Error('no action'))),
      setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
    };
    await expect(recordPassiveError(7, { storage: fakeStorage(), action })).resolves.toBe(1);
  });
});

describe('clearPassiveErrorBadge', () => {
  it('clears the count and blanks the badge', async () => {
    const storage = fakeStorage();
    const action = fakeAction();
    await recordPassiveError(7, { storage, action });
    await clearPassiveErrorBadge(7, { storage, action });
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 7 });
    const { getPassiveErrorCount } = await import('../storage/passive-errors');
    expect(await getPassiveErrorCount(7, { storage })).toBe(0);
  });
});
