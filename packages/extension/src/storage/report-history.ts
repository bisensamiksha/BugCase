import browser from '../lib/browser';

import type { SettingsStorageArea } from './settings';

/** `chrome.storage.local` key holding the metadata-only list of past downloaded reports. */
export const REPORT_HISTORY_STORAGE_KEY = 'bugcase/report-history';

/** Bound on retained history entries; the oldest is evicted past this, like the console/network buffers. */
export const MAX_HISTORY_ENTRIES = 50;

/**
 * A single past download, stored **metadata-only** — never the report body, its assets, or any captured
 * values. Enough to list the capture and reveal its downloaded ZIP for a dashboard hand-off.
 */
export interface ReportHistoryEntry {
  /** `report.metadata.id` — stable per capture, used to de-dupe a re-download. */
  readonly id: string;
  /** ISO timestamp from `report.metadata.page.capturedAt`. */
  readonly capturedAt: string;
  readonly url: string;
  readonly title: string;
  readonly origin: string;
  /** The downloaded ZIP's filename. */
  readonly filename: string;
  /** Final ZIP size in bytes. */
  readonly byteSize: number;
  /** Artifact ids actually included in the download (present minus removed). */
  readonly artifacts: readonly string[];
  /** Browser download handle for "Reveal download"; `null` when unavailable. */
  readonly downloadId: number | null;
  /** `report.metadata.tool.version`. */
  readonly toolVersion: string;
}

export interface HistoryDeps {
  /** Defaults to `browser.storage.local`; injected in tests. */
  readonly storage?: SettingsStorageArea;
}

function area(deps: HistoryDeps): SettingsStorageArea {
  return deps.storage ?? browser.storage.local;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Coerce a possibly-malformed stored value into an entry, or `null` when it lacks a usable id. */
function normalizeEntry(value: unknown): ReportHistoryEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    return null;
  }
  const artifacts = Array.isArray(value.artifacts)
    ? value.artifacts.filter((a): a is string => typeof a === 'string')
    : [];
  return {
    id: value.id,
    capturedAt: asString(value.capturedAt),
    url: asString(value.url),
    title: asString(value.title),
    origin: asString(value.origin),
    filename: asString(value.filename),
    byteSize: asNumber(value.byteSize),
    artifacts,
    downloadId:
      typeof value.downloadId === 'number' && Number.isFinite(value.downloadId)
        ? value.downloadId
        : null,
    toolVersion: asString(value.toolVersion),
  };
}

/** Filter a stored value down to valid entries (newest-first order preserved), capped at the max. */
function normalizeHistory(value: unknown): ReportHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: ReportHistoryEntry[] = [];
  for (const raw of value) {
    const entry = normalizeEntry(raw);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries.slice(0, MAX_HISTORY_ENTRIES);
}

/** Read the persisted history (newest-first). Resolves `[]` on missing/malformed data or a read failure. */
export async function getReportHistory(deps: HistoryDeps = {}): Promise<ReportHistoryEntry[]> {
  try {
    const stored = await area(deps).get(REPORT_HISTORY_STORAGE_KEY);
    return normalizeHistory(stored[REPORT_HISTORY_STORAGE_KEY]);
  } catch {
    return [];
  }
}

async function writeHistory(
  entries: ReportHistoryEntry[],
  deps: HistoryDeps,
): Promise<ReportHistoryEntry[]> {
  const current = await getReportHistory(deps);
  try {
    await area(deps).set({ [REPORT_HISTORY_STORAGE_KEY]: entries });
  } catch {
    return current;
  }
  return entries;
}

/**
 * Prepend `entry` (newest-first), de-duping by `id` so a re-download replaces its earlier record and moves
 * to the front, then cap at {@link MAX_HISTORY_ENTRIES} (oldest evicted). Returns the resulting list; on a
 * write failure returns the current list unchanged (a no-op) rather than throwing.
 */
export async function appendReportHistory(
  entry: ReportHistoryEntry,
  deps: HistoryDeps = {},
): Promise<ReportHistoryEntry[]> {
  const normalized = normalizeEntry(entry);
  if (!normalized) {
    return getReportHistory(deps);
  }
  const current = await getReportHistory(deps);
  const next = [normalized, ...current.filter((e) => e.id !== normalized.id)].slice(
    0,
    MAX_HISTORY_ENTRIES,
  );
  return writeHistory(next, deps);
}

/** Remove the entry with `id`. Returns the resulting list; a no-op on write failure. */
export async function removeReportHistory(
  id: string,
  deps: HistoryDeps = {},
): Promise<ReportHistoryEntry[]> {
  const current = await getReportHistory(deps);
  const next = current.filter((e) => e.id !== id);
  return writeHistory(next, deps);
}

/** Empty the history. Swallows write failures. */
export async function clearReportHistory(deps: HistoryDeps = {}): Promise<void> {
  try {
    await area(deps).set({ [REPORT_HISTORY_STORAGE_KEY]: [] });
  } catch {
    // best-effort — clearing is not worth surfacing an error for
  }
}
