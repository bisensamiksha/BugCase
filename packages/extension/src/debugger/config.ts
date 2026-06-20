import browser from '../lib/browser';

/** `chrome.storage.local` key holding the debugger-capture settings object. */
export const DEBUGGER_CAPTURE_SETTINGS_STORAGE_KEY = 'bugcase/debugger-capture-settings';

/**
 * PRODUCT DECISION (S2-10, OPEN): the final response-body size cap is **not** decided yet.
 *
 * This placeholder default is intentionally conservative and exists only so the code can read a
 * cap from settings today. The real value must be chosen in product review and persisted to user
 * settings — do not treat this constant as the final, shipped cap.
 */
export const PLACEHOLDER_RESPONSE_BODY_CAP_BYTES = 256 * 1024; // TODO(product): finalize the cap

/** Tunables for the on-demand debugger network capture. */
export interface DebuggerCaptureSettings {
  /** Max bytes of any single response body retained; larger bodies are truncated. */
  readonly maxBodyBytes: number;
}

export const DEFAULT_DEBUGGER_CAPTURE_SETTINGS: DebuggerCaptureSettings = {
  maxBodyBytes: PLACEHOLDER_RESPONSE_BODY_CAP_BYTES,
};

/** The slice of a `chrome.storage` area we depend on (promise-style via webextension-polyfill). */
export interface SettingsStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
}

export interface DebuggerSettingsDeps {
  /** Defaults to `browser.storage.local`; injected in tests. */
  readonly storage?: SettingsStorageArea;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Read the debugger-capture settings, merging any persisted values over the defaults. Resolves to
 * {@link DEFAULT_DEBUGGER_CAPTURE_SETTINGS} on missing/malformed data or any storage rejection.
 */
export async function getDebuggerCaptureSettings(
  deps: DebuggerSettingsDeps = {},
): Promise<DebuggerCaptureSettings> {
  try {
    const storage = deps.storage ?? browser.storage.local;
    const stored = await storage.get(DEBUGGER_CAPTURE_SETTINGS_STORAGE_KEY);
    const value = stored[DEBUGGER_CAPTURE_SETTINGS_STORAGE_KEY];
    const maxBodyBytes = (value as { maxBodyBytes?: unknown } | undefined)?.maxBodyBytes;
    return {
      maxBodyBytes: isPositiveNumber(maxBodyBytes)
        ? maxBodyBytes
        : DEFAULT_DEBUGGER_CAPTURE_SETTINGS.maxBodyBytes,
    };
  } catch {
    return DEFAULT_DEBUGGER_CAPTURE_SETTINGS;
  }
}
