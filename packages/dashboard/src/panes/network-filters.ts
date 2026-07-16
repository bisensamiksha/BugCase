import type { NetworkEntry, NetworkInitiator } from '@bugcase/schema';
import type { SearchMatcher } from '@bugcase/shared-ui';

/** Network initiators in schema order — drives the initiator filter chips. */
export const NETWORK_INITIATORS: readonly NetworkInitiator[] = ['fetch', 'xhr', 'unknown'];

/** Sentinel status class for failed / status-less entries. */
export const FAILED_CLASS = 'failed';

/**
 * Coarse status class for one entry. Failed or status-less entries are `'failed'`; everything else
 * buckets by hundreds digit (`'2xx'`, `'4xx'`, …), so **every** entry maps to exactly one class and
 * no row can be orphaned by the chip filter.
 */
export function statusClass(entry: NetworkEntry): string {
  if (entry.failed || entry.status === null) {
    return FAILED_CLASS;
  }
  return `${Math.floor(entry.status / 100)}xx`;
}

/** Epoch-ms bounds: min `startedAt` to max `endedAt ?? startedAt`; null when empty/unparseable. */
export function networkTimeRange(
  entries: readonly NetworkEntry[],
): { minMs: number; maxMs: number } | null {
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    const startMs = Date.parse(entry.startedAt);
    if (!Number.isNaN(startMs) && startMs < minMs) {
      minMs = startMs;
    }
    const endMs = entry.endedAt === null ? startMs : Date.parse(entry.endedAt);
    const end = Number.isNaN(endMs) ? startMs : endMs;
    if (!Number.isNaN(end) && end > maxMs) {
      maxMs = end;
    }
  }
  return minMs === Number.POSITIVE_INFINITY || maxMs === Number.NEGATIVE_INFINITY
    ? null
    : { minMs, maxMs };
}

/** Searchable text: url + method + status + statusText + initiator + request/response header pairs. */
export function entryText(entry: NetworkEntry): string {
  const headers = [...entry.requestHeaders, ...entry.responseHeaders]
    .map((header) => `${header.name} ${header.value}`)
    .join(' ');
  const status = entry.status === null ? '' : String(entry.status);
  return `${entry.url} ${entry.method} ${status} ${entry.statusText ?? ''} ${entry.initiator} ${headers}`;
}

/** Numeric-then-`failed`-last ordering key for a status class. */
function classOrder(cls: string): number {
  return cls === FAILED_CLASS ? Number.POSITIVE_INFINITY : Number.parseInt(cls, 10);
}

/** Distinct status classes present, ordered numerically with `failed` last. */
export function presentStatusClasses(entries: readonly NetworkEntry[]): string[] {
  const seen = new Set(entries.map(statusClass));
  return [...seen].sort((a, b) => classOrder(a) - classOrder(b));
}

/** Distinct HTTP methods present, sorted alphabetically. */
export function distinctMethods(entries: readonly NetworkEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.method))].sort();
}

/** Initiators present, in schema order (`fetch`, `xhr`, `unknown`). */
export function presentInitiators(entries: readonly NetworkEntry[]): NetworkInitiator[] {
  const seen = new Set(entries.map((entry) => entry.initiator));
  return NETWORK_INITIATORS.filter((initiator) => seen.has(initiator));
}

/** Count entries by status class. */
export function statusClassCounts(entries: readonly NetworkEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const cls = statusClass(entry);
    counts[cls] = (counts[cls] ?? 0) + 1;
  }
  return counts;
}

/** Count entries by HTTP method. */
export function methodCounts(entries: readonly NetworkEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.method] = (counts[entry.method] ?? 0) + 1;
  }
  return counts;
}

/** Count entries by initiator. */
export function initiatorCounts(entries: readonly NetworkEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.initiator] = (counts[entry.initiator] ?? 0) + 1;
  }
  return counts;
}

export interface NetworkFilter {
  /** statusClass(entry) must be present in the set to survive. */
  readonly statusClasses: ReadonlySet<string>;
  /** entry.method must be present in the set to survive. */
  readonly methods: ReadonlySet<string>;
  /** entry.initiator must be present in the set to survive. */
  readonly initiators: ReadonlySet<NetworkInitiator>;
  /** null = no search; otherwise applied to entryText(entry). */
  readonly matcher: SearchMatcher | null;
}

/**
 * Pure predicate filter. An entry survives when its status class, method, and initiator are all in
 * their respective active sets and (when searching) its text matches. An empty set for any dimension
 * therefore excludes every entry in that dimension.
 */
export function filterNetwork(
  entries: readonly NetworkEntry[],
  filter: NetworkFilter,
): readonly NetworkEntry[] {
  return entries.filter((entry) => {
    if (!filter.statusClasses.has(statusClass(entry))) {
      return false;
    }
    if (!filter.methods.has(entry.method)) {
      return false;
    }
    if (!filter.initiators.has(entry.initiator)) {
      return false;
    }
    if (filter.matcher && !filter.matcher(entryText(entry))) {
      return false;
    }
    return true;
  });
}
