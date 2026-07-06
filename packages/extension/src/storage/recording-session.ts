/**
 * Durable reproduction-recording session (S3-12, Part B).
 *
 * The reproduction recorder buffers steps in the page's MAIN world, which a navigation destroys — so a
 * multi-page repro would lose everything on the first link click. This module persists the in-progress
 * recording in `chrome.storage.session`, keyed by tab, so it survives navigation (same tab) and even a
 * service-worker eviction. Only the service worker (a trusted context) touches this area; the overlay
 * talks to it over messages (see recording-handler.ts). Defensive, mirroring settings.ts.
 */

import browser from '../lib/browser';

export type RecordingStatus = 'recording' | 'stopped';

/** One recorded interaction, stored loosely — the report mapper (reproduction-log) coerces it. */
export type RecordedStep = Record<string, unknown>;

export interface RecordingSession {
  readonly status: RecordingStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  /** The page the recording is happening on; a mismatch on reopen means a navigation interrupted it. */
  readonly url: string;
  readonly steps: readonly RecordedStep[];
}

/** The slice of a `chrome.storage` area we depend on (promise-style via webextension-polyfill). */
export interface RecordingStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

export interface RecordingSessionDeps {
  /** Defaults to `browser.storage.session`; injected in tests. */
  readonly storage?: RecordingStorageArea;
}

/** Cap on retained steps so a long recording can't grow the stored session unbounded. */
export const MAX_RECORDING_STEPS = 500;

const KEY_PREFIX = 'bugcase/recording:';

function keyFor(tabId: number): string {
  return `${KEY_PREFIX}${tabId}`;
}

function area(deps: RecordingSessionDeps): RecordingStorageArea {
  return deps.storage ?? (browser.storage as unknown as { session: RecordingStorageArea }).session;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Coerce a stored blob into a valid session, or `null` if it isn't usable. */
function normalize(value: unknown): RecordingSession | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = value.status;
  if (status !== 'recording' && status !== 'stopped') {
    return null;
  }
  if (typeof value.startedAt !== 'string' || typeof value.url !== 'string') {
    return null;
  }
  const steps = Array.isArray(value.steps)
    ? value.steps
        .filter((step): step is RecordedStep => isRecord(step))
        .slice(0, MAX_RECORDING_STEPS)
    : [];
  return {
    status,
    startedAt: value.startedAt,
    endedAt: typeof value.endedAt === 'string' ? value.endedAt : null,
    url: value.url,
    steps,
  };
}

export async function getRecordingSession(
  tabId: number,
  deps: RecordingSessionDeps = {},
): Promise<RecordingSession | null> {
  try {
    const key = keyFor(tabId);
    const record = await area(deps).get(key);
    return normalize(record[key]);
  } catch {
    return null;
  }
}

export async function saveRecordingSession(
  tabId: number,
  session: RecordingSession,
  deps: RecordingSessionDeps = {},
): Promise<void> {
  try {
    const capped: RecordingSession = {
      ...session,
      steps: session.steps.slice(-MAX_RECORDING_STEPS),
    };
    await area(deps).set({ [keyFor(tabId)]: capped });
  } catch {
    // A failed persist must not break recording; the in-page recorder still holds the buffer.
  }
}

export async function clearRecordingSession(
  tabId: number,
  deps: RecordingSessionDeps = {},
): Promise<void> {
  try {
    await area(deps).remove(keyFor(tabId));
  } catch {
    // ignore
  }
}
