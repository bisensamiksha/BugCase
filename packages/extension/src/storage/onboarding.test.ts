import { describe, expect, it, vi } from 'vitest';

// Importing lib/browser pulls in the polyfill; the storage area is injected in every test.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  ONBOARDING_SEEN_KEY,
  getOnboardingSeen,
  setOnboardingSeen,
  type OnboardingStorageArea,
} from './onboarding';

function fakeStorage(seed: Record<string, unknown> = {}): OnboardingStorageArea & {
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = { ...seed };
  return {
    data,
    get: (key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (items: Record<string, unknown>) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
  };
}

describe('onboarding seen-state', () => {
  it('is false when nothing is stored', async () => {
    expect(await getOnboardingSeen({ storage: fakeStorage() })).toBe(false);
  });

  it('round-trips a true value', async () => {
    const storage = fakeStorage();
    await setOnboardingSeen(true, { storage });
    expect(storage.data[ONBOARDING_SEEN_KEY]).toBe(true);
    expect(await getOnboardingSeen({ storage })).toBe(true);
  });

  it('treats a non-true stored value as not seen', async () => {
    expect(
      await getOnboardingSeen({ storage: fakeStorage({ [ONBOARDING_SEEN_KEY]: 'yes' }) }),
    ).toBe(false);
    expect(
      await getOnboardingSeen({ storage: fakeStorage({ [ONBOARDING_SEEN_KEY]: false }) }),
    ).toBe(false);
  });

  it('returns false when the storage read rejects', async () => {
    const storage: OnboardingStorageArea = {
      get: () => Promise.reject(new Error('nope')),
      set: () => Promise.resolve(),
    };
    expect(await getOnboardingSeen({ storage })).toBe(false);
  });

  it('never throws when the storage write rejects', async () => {
    const storage: OnboardingStorageArea = {
      get: () => Promise.resolve({}),
      set: () => Promise.reject(new Error('nope')),
    };
    await expect(setOnboardingSeen(true, { storage })).resolves.toBeUndefined();
  });
});
