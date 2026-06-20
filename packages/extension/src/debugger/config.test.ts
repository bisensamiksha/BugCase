import { describe, expect, it, vi } from 'vitest';

// config.ts transitively imports lib/browser; stub the polyfill so the import succeeds in node.
// Every test injects a fake storage area, so the real browser.storage is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  DEBUGGER_CAPTURE_SETTINGS_STORAGE_KEY,
  DEFAULT_DEBUGGER_CAPTURE_SETTINGS,
  PLACEHOLDER_RESPONSE_BODY_CAP_BYTES,
  getDebuggerCaptureSettings,
  setDebuggerCaptureEnabled,
  type SettingsStorageArea,
} from './config';

const storageReturning = (value: unknown): SettingsStorageArea => ({
  get: () => Promise.resolve({ [DEBUGGER_CAPTURE_SETTINGS_STORAGE_KEY]: value }),
  set: () => Promise.resolve(),
});

/** A storage area backed by an in-memory record, for round-trip tests. */
function memoryStorage(initial: Record<string, unknown> = {}): SettingsStorageArea {
  const store = { ...initial };
  return {
    get: (key) => Promise.resolve({ [key]: store[key] }),
    set: (items) => {
      Object.assign(store, items);
      return Promise.resolve();
    },
  };
}

const throwingStorage: SettingsStorageArea = {
  get: () => Promise.reject(new Error('storage unavailable')),
  set: () => Promise.reject(new Error('storage unavailable')),
};

describe('debugger capture config', () => {
  it('defaults the body cap to the named product-decision placeholder and is disabled', () => {
    expect(DEFAULT_DEBUGGER_CAPTURE_SETTINGS.maxBodyBytes).toBe(
      PLACEHOLDER_RESPONSE_BODY_CAP_BYTES,
    );
    expect(DEFAULT_DEBUGGER_CAPTURE_SETTINGS.enabled).toBe(false);
    expect(PLACEHOLDER_RESPONSE_BODY_CAP_BYTES).toBeGreaterThan(0);
  });

  it('returns the default (disabled) when nothing is stored', async () => {
    const settings = await getDebuggerCaptureSettings({ storage: storageReturning(undefined) });
    expect(settings).toEqual(DEFAULT_DEBUGGER_CAPTURE_SETTINGS);
  });

  it('reads a stored enabled flag and body cap', async () => {
    const settings = await getDebuggerCaptureSettings({
      storage: storageReturning({ enabled: true, maxBodyBytes: 1024 }),
    });
    expect(settings).toEqual({ enabled: true, maxBodyBytes: 1024 });
  });

  it('treats a non-true enabled value as disabled', async () => {
    const settings = await getDebuggerCaptureSettings({
      storage: storageReturning({ enabled: 'yes' }),
    });
    expect(settings.enabled).toBe(false);
  });

  it('falls back to the default cap for an invalid stored value', async () => {
    for (const bad of [{ maxBodyBytes: -1 }, { maxBodyBytes: 0 }, { maxBodyBytes: 'big' }, {}]) {
      const settings = await getDebuggerCaptureSettings({ storage: storageReturning(bad) });
      expect(settings.maxBodyBytes).toBe(PLACEHOLDER_RESPONSE_BODY_CAP_BYTES);
    }
  });

  it('never throws on a storage rejection', async () => {
    await expect(getDebuggerCaptureSettings({ storage: throwingStorage })).resolves.toEqual(
      DEFAULT_DEBUGGER_CAPTURE_SETTINGS,
    );
  });

  it('persists the enabled flag while preserving the body cap', async () => {
    const storage = memoryStorage({
      [DEBUGGER_CAPTURE_SETTINGS_STORAGE_KEY]: { enabled: false, maxBodyBytes: 4096 },
    });
    await setDebuggerCaptureEnabled(true, { storage });
    expect(await getDebuggerCaptureSettings({ storage })).toEqual({
      enabled: true,
      maxBodyBytes: 4096,
    });
  });

  it('never throws when persisting fails', async () => {
    const set = vi.fn(() => Promise.reject(new Error('quota')));
    await expect(
      setDebuggerCaptureEnabled(true, { storage: { ...storageReturning(undefined), set } }),
    ).resolves.toBeUndefined();
  });
});
