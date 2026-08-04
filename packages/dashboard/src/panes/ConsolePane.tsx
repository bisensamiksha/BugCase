import type { ConsoleArg, ConsoleEntry, ConsoleLevel, ConsoleLog } from '@bugcase/schema';
import { compileSearch } from '@bugcase/shared-ui';
import { useEffect, useMemo, useState } from 'react';

import { useActiveDescendant } from '../a11y/use-active-descendant';
import { AsyncState } from '../components/AsyncState';
import { JsonTree } from '../components/JsonTree';
import { useVirtualWindow } from '../lib/virtual-window';
import type { ConsoleFilterState } from '../router/hash-state';

import { CONSOLE_LEVELS, consoleTimeRange, filterConsole, levelCounts } from './console-filters';

export interface ConsolePaneProps {
  /** Parsed `report.console`; null when no console log was captured. */
  readonly log: ConsoleLog | null;
  /**
   * Filter state decoded from the URL hash (S4-26). Partial: absent fields keep their default, so a
   * link only has to carry what differs from the default view.
   */
  readonly initialFilters?: Partial<ConsoleFilterState>;
  /** Called whenever the filter state changes, so the caller can reflect it into the hash (S4-26). */
  readonly onFiltersChange?: (state: ConsoleFilterState) => void;
}

/** Fixed row height (px) — keeps virtualization to simple windowing (no dynamic measurement). */
const ROW_H = 28;

const LEVEL_CLASS: Partial<Record<ConsoleLevel, string>> = {
  error: 'text-[var(--bc-danger)]',
  warn: 'text-[var(--bc-warning)]',
};

function messageOf(entry: ConsoleEntry): string {
  return entry.args.map((arg) => arg.preview).join(' ');
}

/** HH:MM:SS from an ISO timestamp; falls back to the raw string. */
function timeOf(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toISOString().slice(11, 19);
}

function ArgValue({ arg }: { readonly arg: ConsoleArg }) {
  const expandable =
    (arg.type === 'object' || arg.type === 'array' || arg.type === 'error') &&
    arg.full !== undefined;
  return expandable ? (
    <JsonTree data={arg.full} defaultOpen />
  ) : (
    <span className="font-mono text-[var(--bc-fg)]">{arg.preview}</span>
  );
}

/**
 * Console pane (S4-07). Replaces the interim `ConsoleTable`: per-level filter chips, full-text +
 * regex search, a single-thumb time-cutoff scrubber, a fixed-height virtualized list, and a
 * master–detail panel that renders object args through the shared `JsonTree`. All ZIP-derived text
 * renders as text nodes / JsonTree — never as HTML.
 */
export function ConsolePane({ log, initialFilters, onFiltersChange }: ConsolePaneProps) {
  const entries = useMemo(() => log?.entries ?? [], [log]);

  // Seeded once from the route; the pane owns its filter state from then on (S4-26). An empty
  // seeded level set means "nothing valid survived decoding" — fall back to all levels rather than
  // rendering an empty pane.
  const [activeLevels, setActiveLevels] = useState<ReadonlySet<ConsoleLevel>>(() =>
    initialFilters?.levels && initialFilters.levels.size > 0
      ? new Set(initialFilters.levels)
      : new Set(CONSOLE_LEVELS),
  );
  const [query, setQuery] = useState(initialFilters?.query ?? '');
  const [useRegex, setUseRegex] = useState(initialFilters?.useRegex ?? false);
  const [cutoffMs, setCutoffMs] = useState<number | null>(initialFilters?.cutoffMs ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(initialFilters?.selectedId ?? null);

  // Report the whole filter state on any change. Covers every setter path — chips, search, regex,
  // the time scrubber and selection — without threading a callback through each one.
  useEffect(() => {
    onFiltersChange?.({ levels: activeLevels, query, useRegex, cutoffMs, selectedId });
  }, [onFiltersChange, activeLevels, query, useRegex, cutoffMs, selectedId]);

  const range = useMemo(() => consoleTimeRange(entries), [entries]);
  const counts = useMemo(() => levelCounts(entries), [entries]);
  const compiled = useMemo(
    () => (query ? compileSearch(query, useRegex) : null),
    [query, useRegex],
  );
  const invalidRegex = compiled !== null && !compiled.valid;

  const visible = useMemo(() => {
    const matcher = compiled === null ? null : compiled.valid ? compiled.match : () => false;
    return filterConsole(entries, { levels: activeLevels, matcher, cutoffMs });
  }, [entries, activeLevels, compiled, cutoffMs]);

  const { window: vwin, containerRef, onScroll } = useVirtualWindow(visible.length, ROW_H);

  // The listbox reasons in indices; the pane's existing selection is by id. Re-derive the index
  // from `selectedId` on every render (rather than caching it in state) so a filter that shrinks
  // `visible` — or filters the selected row out entirely — can never leave a stale/out-of-range
  // index behind. `useActiveDescendant` never re-validates the `activeIndex` it's handed, so this
  // clamping is the pane's responsibility, not the hook's (S4-27). `findIndex` returning -1 (no
  // selection, or the selected row got filtered out) is passed through as-is — the hook treats a
  // negative index as "nothing active" and omits `aria-activedescendant`, rather than us faking
  // index 0 and disagreeing with the row that actually shows `aria-selected="true"`.
  const activeIndex = visible.findIndex((entry) => entry.id === selectedId);
  const { listProps, optionId } = useActiveDescendant({
    count: visible.length,
    rowHeight: ROW_H,
    containerRef,
    idPrefix: 'console-option',
    activeIndex,
    onActiveIndexChange: (index) => setSelectedId(visible[index]?.id ?? null),
    // Without this, aria-activedescendant can name a row the virtual window hasn't rendered yet:
    // useVirtualWindow only recomputes on a throttled native `scroll` event, which a programmatic
    // `scrollTop` assignment never fires (and jsdom never fires at all).
    onScrollSync: onScroll,
  });

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const showScrubber = range !== null && range.maxMs > range.minMs;

  function toggleLevel(level: ConsoleLevel): void {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <section data-testid="console-pane" aria-label="Console" className="flex h-full flex-col p-4">
        <AsyncState
          status="empty"
          empty={
            <p data-testid="console-empty" className="text-[var(--bc-fg-muted)]">
              No console entries captured.
            </p>
          }
        />
      </section>
    );
  }

  return (
    <section data-testid="console-pane" aria-label="Console" className="flex h-full flex-col p-4">
      <div
        role="group"
        aria-label="Console filters"
        className="mb-3 flex flex-wrap items-center gap-3"
      >
        <div role="group" aria-label="Levels" className="flex gap-1">
          {CONSOLE_LEVELS.map((level) => {
            const on = activeLevels.has(level);
            return (
              <button
                key={level}
                type="button"
                data-testid={`console-level-${level}`}
                aria-pressed={on}
                aria-label={`${level} (${counts[level]})`}
                onClick={() => toggleLevel(level)}
                className={`rounded px-2 py-0.5 font-mono text-xs ${
                  on
                    ? 'bg-[var(--bc-accent)] text-[var(--bc-accent-fg)]'
                    : 'border border-[var(--bc-border-strong)] text-[var(--bc-fg-muted)]'
                }`}
              >
                {level} {counts[level]}
              </button>
            );
          })}
        </div>

        <input
          type="search"
          data-testid="console-search"
          aria-label="Search console"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-[160px] flex-1 rounded border border-[var(--bc-border-strong)] bg-[var(--bc-bg)] px-2 py-1 text-sm text-[var(--bc-fg)]"
        />
        <label className="flex items-center gap-1 text-sm text-[var(--bc-fg)]">
          <input
            type="checkbox"
            data-testid="console-regex"
            checked={useRegex}
            onChange={(event) => setUseRegex(event.target.checked)}
          />
          Regex
        </label>

        {showScrubber ? (
          <div className="flex items-center gap-2">
            <input
              type="range"
              data-testid="console-time"
              aria-label="Show entries up to"
              aria-valuetext={
                cutoffMs === null ? 'all entries' : timeOf(new Date(cutoffMs).toISOString())
              }
              min={range.minMs}
              max={range.maxMs}
              step={1}
              value={cutoffMs ?? range.maxMs}
              onChange={(event) => setCutoffMs(Number(event.target.value))}
            />
            <button
              type="button"
              data-testid="console-time-reset"
              onClick={() => setCutoffMs(null)}
              className="text-xs text-[var(--bc-fg-muted)] underline"
            >
              Show all
            </button>
          </div>
        ) : null}

        <span data-testid="console-count" className="text-xs text-[var(--bc-fg-muted)]">
          {visible.length} of {entries.length}
        </span>
      </div>

      {invalidRegex ? (
        <p
          data-testid="console-invalid-regex"
          role="alert"
          className="mb-2 text-sm text-[var(--bc-danger)]"
        >
          Invalid regular expression.
        </p>
      ) : null}

      <div
        ref={containerRef}
        onScroll={onScroll}
        data-testid="console-list"
        aria-label="Console entries"
        {...listProps}
        className="flex-1 overflow-auto rounded border border-[var(--bc-border)] outline-none"
      >
        {visible.length === 0 ? null : (
          <div style={{ paddingTop: vwin.padTop, paddingBottom: vwin.padBottom }}>
            {visible.slice(vwin.startIndex, vwin.endIndex + 1).map((entry, offset) => {
              const index = vwin.startIndex + offset;
              const current = entry.id === selectedId;
              return (
                <div
                  key={entry.id}
                  id={optionId(index)}
                  role="option"
                  tabIndex={-1}
                  data-testid="console-row"
                  aria-selected={current}
                  aria-label={`${entry.level} ${timeOf(entry.timestamp)} ${messageOf(entry)}`}
                  onClick={() => setSelectedId(entry.id)}
                  style={{ height: ROW_H }}
                  className={`flex w-full cursor-pointer items-center gap-3 border-l-2 px-3 text-left font-mono text-sm ${
                    current
                      ? 'border-[var(--bc-accent)] bg-[var(--bc-surface)]'
                      : 'border-transparent'
                  }`}
                >
                  <span
                    className={`w-12 shrink-0 ${LEVEL_CLASS[entry.level] ?? 'text-[var(--bc-fg-muted)]'}`}
                  >
                    {entry.level}
                  </span>
                  <span className="w-20 shrink-0 text-[var(--bc-fg-muted)]">
                    {timeOf(entry.timestamp)}
                  </span>
                  <span className="truncate text-[var(--bc-fg)]">{messageOf(entry)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {visible.length === 0 ? (
        // A sibling of the listbox, not a child: role="listbox" requires role="option" owned
        // children (axe: aria-required-children), so this message lives outside it. The listbox
        // itself stays permanently role="listbox" — just empty — rather than losing its role.
        <p data-testid="console-no-matches" className="p-3 text-sm text-[var(--bc-fg-muted)]">
          No entries match the current filters.
        </p>
      ) : null}

      <div
        data-testid="console-detail"
        className="mt-3 max-h-64 overflow-auto rounded border border-[var(--bc-border)] p-3"
      >
        {selected ? (
          <div>
            <p className="font-mono text-sm text-[var(--bc-fg)]">
              <span className={LEVEL_CLASS[selected.level] ?? ''}>{selected.level}</span>
              {` · ${timeOf(selected.timestamp)}`}
              {selected.source
                ? ` · ${selected.source.file}:${selected.source.line}:${selected.source.column}`
                : ''}
            </p>
            <p className="mt-2 text-xs font-semibold text-[var(--bc-fg-muted)]">args</p>
            <ol className="mt-1 space-y-1">
              {selected.args.map((arg, index) => (
                <li key={`${selected.id}-${index}`} data-testid="console-arg" className="text-sm">
                  <span className="mr-1 text-[var(--bc-fg-muted)]">{index}:</span>
                  <ArgValue arg={arg} />
                </li>
              ))}
            </ol>
            {selected.stack ? (
              <details data-testid="console-stack" className="mt-2">
                <summary className="cursor-pointer text-xs text-[var(--bc-fg-muted)]">
                  Stack
                </summary>
                <pre className="mt-1 overflow-auto whitespace-pre-wrap text-xs text-[var(--bc-fg)]">
                  {selected.stack}
                </pre>
              </details>
            ) : null}
          </div>
        ) : (
          <p data-testid="console-detail-empty" className="text-sm text-[var(--bc-fg-muted)]">
            Select an entry to see its details.
          </p>
        )}
      </div>
    </section>
  );
}
