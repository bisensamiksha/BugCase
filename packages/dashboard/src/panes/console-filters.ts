import type { ConsoleEntry, ConsoleLevel } from '@bugcase/schema';
import type { SearchMatcher } from '@bugcase/shared-ui';

/** Console levels in schema order — drives the filter chips. */
export const CONSOLE_LEVELS: readonly ConsoleLevel[] = [
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'trace',
];

/** Epoch-ms bounds of the entries; null when empty or no timestamp parses. */
export function consoleTimeRange(
  entries: readonly ConsoleEntry[],
): { minMs: number; maxMs: number } | null {
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    const ms = Date.parse(entry.timestamp);
    if (Number.isNaN(ms)) {
      continue;
    }
    if (ms < minMs) {
      minMs = ms;
    }
    if (ms > maxMs) {
      maxMs = ms;
    }
  }
  return minMs === Number.POSITIVE_INFINITY ? null : { minMs, maxMs };
}

/** Searchable text for one entry: level + joined arg previews + source file. */
export function entryText(entry: ConsoleEntry): string {
  const args = entry.args.map((arg) => arg.preview).join(' ');
  const source = entry.source ? entry.source.file : '';
  return `${entry.level} ${args} ${source}`;
}

/** Per-level counts across all entries (0 for absent levels). */
export function levelCounts(entries: readonly ConsoleEntry[]): Record<ConsoleLevel, number> {
  const counts: Record<ConsoleLevel, number> = {
    log: 0,
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
    trace: 0,
  };
  for (const entry of entries) {
    counts[entry.level] += 1;
  }
  return counts;
}

export interface ConsoleFilter {
  /** entry.level must be present in the set to survive. */
  readonly levels: ReadonlySet<ConsoleLevel>;
  /** null = no search; otherwise applied to entryText(entry). */
  readonly matcher: SearchMatcher | null;
  /** null = no cutoff; otherwise drop entries whose timestamp is strictly after cutoffMs. */
  readonly cutoffMs: number | null;
}

/** Pure predicate filter. Entries with an unparseable timestamp are kept under a cutoff (fail-open). */
export function filterConsole(
  entries: readonly ConsoleEntry[],
  filter: ConsoleFilter,
): readonly ConsoleEntry[] {
  return entries.filter((entry) => {
    if (!filter.levels.has(entry.level)) {
      return false;
    }
    if (filter.matcher && !filter.matcher(entryText(entry))) {
      return false;
    }
    if (filter.cutoffMs !== null) {
      const ms = Date.parse(entry.timestamp);
      if (!Number.isNaN(ms) && ms > filter.cutoffMs) {
        return false;
      }
    }
    return true;
  });
}
