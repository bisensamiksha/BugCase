/**
 * Durable overlay draft (BUG-06).
 *
 * The overlay's form state lives in React state inside the page's document, which every navigation
 * destroys — so options, bug details and element inspections configured before a navigation were
 * silently discarded and the capture shipped defaults. This persists the draft in
 * `chrome.storage.session`, keyed by tab, so it survives navigation and a service-worker eviction.
 * Only the service worker (a trusted context) touches this area; the overlay talks to it over
 * messages (see overlay-draft-handler.ts). Defensive, mirroring recording-session.ts.
 */

import type { UserInput, UserOptions } from '@bugcase/schema';

import type { CaptureElementInspection } from '../background/element-inspection-finalize';
import browser from '../lib/browser';
import type { PanelPosition } from '../overlay/draggable-panel';

/** Cosmetic overlay state restored alongside the form, so the panel reappears where it was. */
export interface OverlayDraftUiState {
  readonly minimized: boolean;
  readonly panelPos: PanelPosition | null;
}

export interface OverlayDraft {
  readonly captureOptions: UserOptions;
  readonly userReport: UserInput;
  readonly inspections: readonly CaptureElementInspection[];
  readonly ui: OverlayDraftUiState;
}

/** The slice of a `chrome.storage` area we depend on (promise-style via webextension-polyfill). */
export interface OverlayDraftStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

export interface OverlayDraftDeps {
  /** Defaults to `browser.storage.session`; injected in tests. */
  readonly storage?: OverlayDraftStorageArea;
}

const KEY_PREFIX = 'bugcase/overlay-draft:';

function keyFor(tabId: number): string {
  return `${KEY_PREFIX}${tabId}`;
}

function area(deps: OverlayDraftDeps): OverlayDraftStorageArea {
  return (
    deps.storage ?? (browser.storage as unknown as { session: OverlayDraftStorageArea }).session
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeUi(value: unknown): OverlayDraftUiState {
  if (!isRecord(value)) {
    return { minimized: false, panelPos: null };
  }
  const pos = value.panelPos;
  const panelPos =
    isRecord(pos) && typeof pos.top === 'number' && typeof pos.left === 'number'
      ? { top: pos.top, left: pos.left }
      : null;
  return { minimized: value.minimized === true, panelPos };
}

/**
 * Coerce a stored blob into a usable draft, or `null` if it isn't.
 *
 * `captureOptions` / `userReport` are cast rather than field-checked: this area is written only by
 * our own service worker, and the overlay merges both over its canonical defaults on rehydrate, so a
 * missing field cannot reach the form.
 */
function normalize(value: unknown): OverlayDraft | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!isRecord(value.captureOptions) || !isRecord(value.userReport)) {
    return null;
  }
  const inspections = Array.isArray(value.inspections)
    ? value.inspections.filter((entry): entry is CaptureElementInspection => isRecord(entry))
    : [];
  return {
    captureOptions: value.captureOptions as unknown as UserOptions,
    userReport: value.userReport as unknown as UserInput,
    inspections,
    ui: normalizeUi(value.ui),
  };
}

export async function getOverlayDraft(
  tabId: number,
  deps: OverlayDraftDeps = {},
): Promise<OverlayDraft | null> {
  try {
    const key = keyFor(tabId);
    const record = await area(deps).get(key);
    return normalize(record[key]);
  } catch {
    return null;
  }
}

export async function saveOverlayDraft(
  tabId: number,
  draft: OverlayDraft,
  deps: OverlayDraftDeps = {},
): Promise<void> {
  try {
    await area(deps).set({ [keyFor(tabId)]: draft });
  } catch {
    // A failed persist must not break the overlay; it only costs the restore on navigation.
  }
}

export async function clearOverlayDraft(tabId: number, deps: OverlayDraftDeps = {}): Promise<void> {
  try {
    await area(deps).remove(keyFor(tabId));
  } catch {
    // ignore
  }
}
