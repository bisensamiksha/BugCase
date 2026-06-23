/**
 * Navigation history collector (S2-15).
 *
 * Maps `chrome.history.search` results into the report's {@link NavigationLog}. Pure and
 * dependency-injected (the real `history.search` is supplied by `background/history-handler.ts`)
 * so it is unit-testable without the browser, mirroring the S2-13 DOM-snapshot collector. URLs are
 * run through {@link maskSecretsInString} (Bearer/JWT redaction); page titles are kept as-is.
 * Never throws: a rejected search resolves to `null`.
 */

import { maskSecretsInString, type NavigationEntry, type NavigationLog } from '@bugcase/schema';

/** Recent-history window: the last 60 minutes, tied to the bug session. */
export const NAVIGATION_HISTORY_WINDOW_MS = 60 * 60 * 1000;
/** Hard cap on entries pulled into the report. */
export const NAVIGATION_HISTORY_MAX_RESULTS = 50;

/** Subset of `chrome.history.HistoryItem` the collector reads (all fields best-effort). */
export interface HistoryItemLike {
  readonly url?: string;
  readonly title?: string;
  readonly lastVisitTime?: number; // ms since epoch
}

export interface HistorySearchQuery {
  readonly text: string;
  readonly startTime: number;
  readonly maxResults: number;
}

export interface CollectNavigationHistoryDeps {
  /** Runs the history query (live: `browser.history.search`; tests inject a fake). */
  readonly search: (query: HistorySearchQuery) => Promise<readonly HistoryItemLike[]>;
  /** Injectable clock so the query window is deterministic in tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Map one history item to a schema entry, or `null` if it lacks a usable url/timestamp. */
function toEntry(item: HistoryItemLike): NavigationEntry | null {
  if (typeof item.url !== 'string' || item.url.length === 0) {
    return null;
  }
  if (typeof item.lastVisitTime !== 'number' || !Number.isFinite(item.lastVisitTime)) {
    return null;
  }
  const date = new Date(item.lastVisitTime);
  // An out-of-range finite timestamp (|n| > 8.64e15 ms) yields an Invalid Date whose
  // toISOString() throws; drop just this item rather than letting it abort the whole collection.
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return {
    url: maskSecretsInString(item.url).value,
    title: typeof item.title === 'string' ? item.title : '',
    visitedAt: date.toISOString(),
  };
}

/**
 * Collect recent navigation history into a {@link NavigationLog}. Returns an empty log when the
 * window has no visits, and `null` only when the search rejects (never throws).
 */
export async function collectNavigationHistory(
  deps: CollectNavigationHistoryDeps,
): Promise<NavigationLog | null> {
  const now = deps.now ?? Date.now;
  try {
    const items = await deps.search({
      text: '',
      startTime: now() - NAVIGATION_HISTORY_WINDOW_MS,
      maxResults: NAVIGATION_HISTORY_MAX_RESULTS,
    });
    const entries = items
      .map(toEntry)
      .filter((entry): entry is NavigationEntry => entry !== null)
      .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
    return { schemaVersion: 'v1', entries };
  } catch {
    return null;
  }
}
