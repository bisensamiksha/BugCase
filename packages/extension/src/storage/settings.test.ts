import { SENSITIVE_HEADER_NAMES } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

// The module transitively imports lib/browser; stub the polyfill so the import succeeds in node.
// Every test injects a fake storage area, so the real browser.storage is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { DEFAULT_USER_OPTIONS } from '../capture/metadata';

import {
  DEFAULT_RING_BUFFER_SIZE,
  DEFAULT_SETTINGS,
  MAX_RING_BUFFER_SIZE,
  MIN_RING_BUFFER_SIZE,
  SCRUBBER_TOGGLE_DEFS,
  SETTINGS_STORAGE_KEY,
  getSettings,
  saveSettings,
  type SettingsStorageArea,
} from './settings';

function fakeStorage(initial: Record<string, unknown> = {}): SettingsStorageArea & {
  data: Record<string, unknown>;
} {
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

const rejectingStorage: SettingsStorageArea = {
  get: () => Promise.reject(new Error('nope')),
  set: () => Promise.reject(new Error('nope')),
};

describe('settings defaults', () => {
  it('ships defaults that match the capture/scrubber/header sources of truth', () => {
    expect(DEFAULT_SETTINGS.defaultCaptureOptions).toEqual(DEFAULT_USER_OPTIONS);
    expect(DEFAULT_SETTINGS.maxRingBufferSize).toBe(DEFAULT_RING_BUFFER_SIZE);
    expect(DEFAULT_SETTINGS.blockedHeaders).toEqual(SENSITIVE_HEADER_NAMES);
    // every known scrubber toggle defaults to on
    for (const def of SCRUBBER_TOGGLE_DEFS) {
      expect(DEFAULT_SETTINGS.scrubbers[def.id]).toBe(true);
    }
  });
});

describe('getSettings', () => {
  it('returns the defaults when storage is empty', async () => {
    const settings = await getSettings({ storage: fakeStorage() });
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a partial stored value over the defaults', async () => {
    const storage = fakeStorage({ [SETTINGS_STORAGE_KEY]: { maxRingBufferSize: 1000 } });
    const settings = await getSettings({ storage });
    expect(settings.maxRingBufferSize).toBe(1000);
    // untouched sections fall back to defaults
    expect(settings.defaultCaptureOptions).toEqual(DEFAULT_USER_OPTIONS);
    expect(settings.blockedHeaders).toEqual(SENSITIVE_HEADER_NAMES);
  });

  it('clamps an out-of-range ring-buffer size and ignores malformed fields without throwing', async () => {
    const storage = fakeStorage({
      [SETTINGS_STORAGE_KEY]: {
        maxRingBufferSize: 9_999_999,
        blockedHeaders: 'not-an-array',
        scrubbers: 42,
      },
    });
    const settings = await getSettings({ storage });
    expect(settings.maxRingBufferSize).toBe(MAX_RING_BUFFER_SIZE);
    expect(settings.blockedHeaders).toEqual(SENSITIVE_HEADER_NAMES);
    expect(settings.scrubbers).toEqual(DEFAULT_SETTINGS.scrubbers);
  });

  it('normalizes blocked headers to trimmed, lowercased, de-duplicated names', async () => {
    const storage = fakeStorage({
      [SETTINGS_STORAGE_KEY]: {
        blockedHeaders: ['  Authorization ', 'authorization', 'X-Api-Key', ''],
      },
    });
    const settings = await getSettings({ storage });
    expect(settings.blockedHeaders).toEqual(['authorization', 'x-api-key']);
  });

  it('returns the defaults when the storage read rejects', async () => {
    const settings = await getSettings({ storage: rejectingStorage });
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('saveSettings', () => {
  it('persists a partial update merged with current settings and returns the result', async () => {
    const storage = fakeStorage();
    const saved = await saveSettings({ maxRingBufferSize: 250 }, { storage });
    expect(saved.maxRingBufferSize).toBe(250);

    const reread = await getSettings({ storage });
    expect(reread.maxRingBufferSize).toBe(250);
    expect(reread.defaultCaptureOptions).toEqual(DEFAULT_USER_OPTIONS);
  });

  it('clamps a below-range ring-buffer size on save', async () => {
    const storage = fakeStorage();
    const saved = await saveSettings({ maxRingBufferSize: 1 }, { storage });
    expect(saved.maxRingBufferSize).toBe(MIN_RING_BUFFER_SIZE);
  });

  it('returns the current settings without throwing when the write rejects', async () => {
    const saved = await saveSettings({ maxRingBufferSize: 250 }, { storage: rejectingStorage });
    expect(saved).toEqual(DEFAULT_SETTINGS);
  });
});
