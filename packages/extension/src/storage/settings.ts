import {
  COOKIE_VALUE_MASK_RULE_ID,
  DOM_ALL_INPUT_MASK_RULE_ID,
  DOM_SCRIPT_STRIP_RULE_ID,
  HEADER_SECRET_MASK_RULE_ID,
  PASSWORD_PLACEHOLDER_RULE_ID,
  SENSITIVE_HEADER_NAMES,
  type UserOptions,
} from '@bugcase/schema';

import { DEFAULT_USER_OPTIONS } from '../capture/metadata';
import browser from '../lib/browser';

/** `chrome.storage.local` key holding the user's persisted BugCase settings. */
export const SETTINGS_STORAGE_KEY = 'bugcase/settings';

/** A scrubber rule the user can turn off from the settings page, keyed by its schema rule id. */
export interface ScrubberToggleDef {
  readonly id: string;
  readonly label: string;
}

/** Every user-togglable scrubber, referencing the schema's stable rule ids so they never drift. */
export const SCRUBBER_TOGGLE_DEFS: readonly ScrubberToggleDef[] = [
  // The credential mask (DOM_PASSWORD_INPUT_MASK_RULE_ID) is intentionally NOT here: it is
  // unconditional in `createDomScrubberRules`, so a switch for it would either do nothing or, if
  // wired, let a password reach the report and falsify the published "text is scrubbed" claim.
  { id: DOM_ALL_INPUT_MASK_RULE_ID, label: 'Mask all input values in DOM snapshots' },
  { id: DOM_SCRIPT_STRIP_RULE_ID, label: 'Strip <script> tags from DOM snapshots' },
  { id: PASSWORD_PLACEHOLDER_RULE_ID, label: 'Replace password field contents with a placeholder' },
  { id: HEADER_SECRET_MASK_RULE_ID, label: 'Mask sensitive request/response headers' },
  { id: COOKIE_VALUE_MASK_RULE_ID, label: 'Mask cookie values' },
];

/** Per-rule enable flags, keyed by scrubber rule id. */
export type ScrubberToggles = Readonly<Record<string, boolean>>;

/** Bounds for the console/network ring-buffer size, to keep a pathological value from bloating captures. */
export const MIN_RING_BUFFER_SIZE = 50;
export const MAX_RING_BUFFER_SIZE = 5000;
/** Matches DEFAULT_CONSOLE_BUFFER_SIZE / DEFAULT_NETWORK_BUFFER_SIZE in the injected ring buffers. */
export const DEFAULT_RING_BUFFER_SIZE = 500;

export interface BugCaseSettings {
  /** Capture options pre-selected when the overlay opens. */
  readonly defaultCaptureOptions: UserOptions;
  /** Which scrubber rules are enabled. */
  readonly scrubbers: ScrubberToggles;
  /** Max entries retained by the console/network ring buffers. */
  readonly maxRingBufferSize: number;
  /** Header names whose values are masked (lowercased). */
  readonly blockedHeaders: readonly string[];
}

/**
 * Rules that default OFF. Everything else defaults on. `dom-all-input-mask` and `dom-script-strip`
 * are opt-in so the default stays "sensitive only" — masking every field or stripping every script
 * would gut the debugging value of a report (BUG-04).
 */
const DEFAULT_OFF_RULE_IDS: readonly string[] = [
  DOM_ALL_INPUT_MASK_RULE_ID,
  DOM_SCRIPT_STRIP_RULE_ID,
];

export const DEFAULT_SCRUBBER_TOGGLES: ScrubberToggles = Object.freeze(
  Object.fromEntries(
    SCRUBBER_TOGGLE_DEFS.map((def) => [def.id, !DEFAULT_OFF_RULE_IDS.includes(def.id)]),
  ),
);

export const DEFAULT_SETTINGS: BugCaseSettings = {
  defaultCaptureOptions: DEFAULT_USER_OPTIONS,
  scrubbers: DEFAULT_SCRUBBER_TOGGLES,
  maxRingBufferSize: DEFAULT_RING_BUFFER_SIZE,
  blockedHeaders: SENSITIVE_HEADER_NAMES,
};

/** The slice of a `chrome.storage` area we depend on (promise-style via webextension-polyfill). */
export interface SettingsStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface SettingsDeps {
  /** Defaults to `browser.storage.local`; injected in tests. */
  readonly storage?: SettingsStorageArea;
}

function area(deps: SettingsDeps): SettingsStorageArea {
  return deps.storage ?? browser.storage.local;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeCaptureOptions(value: unknown): UserOptions {
  if (!isRecord(value)) {
    return DEFAULT_USER_OPTIONS;
  }
  const next = { ...DEFAULT_USER_OPTIONS };
  for (const key of Object.keys(DEFAULT_USER_OPTIONS) as (keyof UserOptions)[]) {
    const stored = value[key];
    if (typeof stored === 'boolean') {
      next[key] = stored;
    }
  }
  // Screenshot mode is single-select (BUG-03): repair a legacy/corrupt state that has both modes on
  // by keeping Visible area (the default) and clearing Full page.
  if (next.viewportScreenshot && next.fullPageScreenshot) {
    next.fullPageScreenshot = false;
  }
  return next;
}

function normalizeScrubbers(value: unknown): ScrubberToggles {
  if (!isRecord(value)) {
    return DEFAULT_SCRUBBER_TOGGLES;
  }
  const next: Record<string, boolean> = {};
  for (const def of SCRUBBER_TOGGLE_DEFS) {
    const stored = value[def.id];
    next[def.id] = typeof stored === 'boolean' ? stored : DEFAULT_SCRUBBER_TOGGLES[def.id] === true;
  }
  return next;
}

function normalizeRingBufferSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_RING_BUFFER_SIZE;
  }
  return Math.min(MAX_RING_BUFFER_SIZE, Math.max(MIN_RING_BUFFER_SIZE, Math.round(value)));
}

function normalizeBlockedHeaders(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return SENSITIVE_HEADER_NAMES;
  }
  const seen = new Set<string>();
  const next: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const name = entry.trim().toLowerCase();
    if (name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
    next.push(name);
  }
  return next;
}

/** Coerce a possibly-partial/malformed stored value into a complete, valid settings object. */
function normalizeSettings(value: unknown): BugCaseSettings {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS;
  }
  return {
    defaultCaptureOptions: normalizeCaptureOptions(value.defaultCaptureOptions),
    scrubbers: normalizeScrubbers(value.scrubbers),
    maxRingBufferSize: normalizeRingBufferSize(value.maxRingBufferSize),
    blockedHeaders: normalizeBlockedHeaders(value.blockedHeaders),
  };
}

/** Read the persisted settings. Resolves the defaults on missing/malformed data or any storage rejection. */
export async function getSettings(deps: SettingsDeps = {}): Promise<BugCaseSettings> {
  try {
    const stored = await area(deps).get(SETTINGS_STORAGE_KEY);
    return normalizeSettings(stored[SETTINGS_STORAGE_KEY]);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Merge `update` over the current settings, normalize, and persist. Returns the resulting settings;
 * on a storage write failure returns the current settings unchanged (a no-op) rather than throwing.
 */
export async function saveSettings(
  update: Partial<BugCaseSettings>,
  deps: SettingsDeps = {},
): Promise<BugCaseSettings> {
  const current = await getSettings(deps);
  const next = normalizeSettings({ ...current, ...update });
  try {
    await area(deps).set({ [SETTINGS_STORAGE_KEY]: next });
  } catch {
    return current;
  }
  return next;
}
