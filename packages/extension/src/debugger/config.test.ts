import { describe, expect, it, vi } from 'vitest';

// config.ts transitively imports lib/browser; stub the polyfill so the import succeeds in node.
// Every test injects a fake storage area, so the real browser.storage is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  DEBUGGER_CAPTURE_SETTINGS_STORAGE_KEY,
  DEFAULT_DEBUGGER_CAPTURE_SETTINGS,
  PLACEHOLDER_RESPONSE_BODY_CAP_BYTES,
  getDebuggerCaptureSettings,
  type SettingsStorageArea,
} from './config';

const storageReturning = (value: unknown): SettingsStorageArea => ({
  get: () => Promise.resolve({ [DEBUGGER_CAPTURE_SETTINGS_STORAGE_KEY]: value }),
});

const throwingStorage: SettingsStorageArea = {
  get: () => Promise.reject(new Error('storage unavailable')),
};

describe('debugger capture config', () => {
  it('defaults the body cap to the named product-decision placeholder', () => {
    expect(DEFAULT_DEBUGGER_CAPTURE_SETTINGS.maxBodyBytes).toBe(
      PLACEHOLDER_RESPONSE_BODY_CAP_BYTES,
    );
    expect(PLACEHOLDER_RESPONSE_BODY_CAP_BYTES).toBeGreaterThan(0);
  });

  it('returns the default when nothing is stored', async () => {
    const settings = await getDebuggerCaptureSettings({ storage: storageReturning(undefined) });
    expect(settings).toEqual(DEFAULT_DEBUGGER_CAPTURE_SETTINGS);
  });

  it('uses a stored positive maxBodyBytes', async () => {
    const settings = await getDebuggerCaptureSettings({
      storage: storageReturning({ maxBodyBytes: 1024 }),
    });
    expect(settings.maxBodyBytes).toBe(1024);
  });

  it('falls back to the default for an invalid stored value', async () => {
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
});
