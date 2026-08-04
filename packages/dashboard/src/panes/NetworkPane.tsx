import type {
  NetworkBody,
  NetworkEntry,
  NetworkHeader,
  NetworkInitiator,
  NetworkLog,
} from '@bugcase/schema';
import { compileSearch } from '@bugcase/shared-ui';
import { useEffect, useMemo, useState } from 'react';

import { useActiveDescendant } from '../a11y/use-active-descendant';
import { AsyncState } from '../components/AsyncState';
import { JsonTree } from '../components/JsonTree';
import { toCurl } from '../lib/curl';
import { useVirtualWindow } from '../lib/virtual-window';
import type { NetworkFilterState } from '../router/hash-state';

import { Waterfall, statusClassColor } from './Waterfall';
import {
  distinctMethods,
  filterNetwork,
  initiatorCounts,
  methodCounts,
  networkTimeRange,
  presentInitiators,
  presentStatusClasses,
  statusClass,
  statusClassCounts,
} from './network-filters';

export interface NetworkPaneProps {
  /** Parsed `report.network`; null when no network log was captured. */
  readonly log: NetworkLog | null;
  /**
   * Filter state decoded from the URL hash (S4-26). Partial: absent fields keep their default. Set
   * members are intersected with the values this report actually contains, so a link built against
   * another capture degrades to a usable view rather than an empty table.
   */
  readonly initialFilters?: Partial<NetworkFilterState>;
  /** Called whenever the filter state changes, so the caller can reflect it into the hash (S4-26). */
  readonly onFiltersChange?: (state: NetworkFilterState) => void;
}

/** Seed an active set from the route, keeping only values present here; empty seed → everything. */
function seedSet<T extends string>(
  seeded: ReadonlySet<T> | undefined,
  availableValues: readonly T[],
): Set<T> {
  if (!seeded || seeded.size === 0) {
    return new Set(availableValues);
  }
  const kept = availableValues.filter((value) => seeded.has(value));
  return kept.length > 0 ? new Set(kept) : new Set(availableValues);
}

/** Fixed row height (px) — keeps virtualization to simple windowing (no dynamic measurement). */
const ROW_H = 28;

const DASH = '—';

/** Human-readable byte size without ever rendering "null". */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Status cell text: "failed" for failed/status-less entries, otherwise the numeric code. */
function statusLabel(entry: NetworkEntry): string {
  return entry.failed || entry.status === null ? 'failed' : String(entry.status);
}

function durationLabel(entry: NetworkEntry): string {
  return entry.durationMs === null ? DASH : `${entry.durationMs} ms`;
}

function sizeLabel(entry: NetworkEntry): string {
  return entry.response === null ? DASH : formatBytes(entry.response.sizeBytes);
}

/** Render a captured body: JSON as a JsonTree, other text as `<pre>`, binary as a note. Never HTML. */
function BodyView({
  body,
  testId,
}: {
  readonly body: NetworkBody | null;
  readonly testId: string;
}) {
  if (body === null) {
    return (
      <p data-testid={testId} className="text-sm text-[var(--bc-fg-muted)]">
        No body
      </p>
    );
  }
  const truncated = body.truncated ? ' (truncated)' : '';
  if (body.text !== undefined) {
    let parsed: unknown;
    let isJson = false;
    try {
      parsed = JSON.parse(body.text);
      isJson = typeof parsed === 'object' && parsed !== null;
    } catch {
      isJson = false;
    }
    return (
      <div data-testid={testId}>
        {isJson ? (
          <JsonTree data={parsed} defaultOpen />
        ) : (
          <pre className="overflow-auto whitespace-pre-wrap text-xs text-[var(--bc-fg)]">
            {body.text}
          </pre>
        )}
        {truncated ? <span className="text-xs text-[var(--bc-fg-muted)]">{truncated}</span> : null}
      </div>
    );
  }
  if (body.base64 !== undefined) {
    return (
      <p data-testid={testId} className="text-sm text-[var(--bc-fg-muted)]">
        binary ({body.mimeType ?? 'unknown'}, {body.sizeBytes} bytes){truncated}
      </p>
    );
  }
  return (
    <p data-testid={testId} className="text-sm text-[var(--bc-fg-muted)]">
      No body
    </p>
  );
}

function HeaderList({
  headers,
  testId,
  label,
}: {
  readonly headers: readonly NetworkHeader[];
  readonly testId: string;
  readonly label: string;
}) {
  if (headers.length === 0) {
    return <p className="text-sm text-[var(--bc-fg-muted)]">No {label.toLowerCase()}</p>;
  }
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 text-xs">
      {headers.map((header, index) => (
        <div key={`${header.name}-${index}`} data-testid={testId} className="contents">
          <dt className="font-mono text-[var(--bc-fg-muted)]">{header.name}</dt>
          <dd className="break-all font-mono text-[var(--bc-fg)]">{header.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Network pane (S4-08). Replaces the interim `NetworkTable`: status-class / method / initiator filter
 * chips with counts, full-text + regex search, a fixed-height virtualized request list with an inline
 * SVG waterfall column, and a master–detail panel showing headers, request/response bodies (JSON via
 * the shared `JsonTree`), and a copy-as-cURL action. All ZIP-derived text renders as text nodes /
 * JsonTree — never as HTML — and binary body bytes are never rendered.
 */
export function NetworkPane({ log, initialFilters, onFiltersChange }: NetworkPaneProps) {
  const entries = useMemo(() => log?.entries ?? [], [log]);

  const classes = useMemo(() => presentStatusClasses(entries), [entries]);
  const methods = useMemo(() => distinctMethods(entries), [entries]);
  const initiators = useMemo(() => presentInitiators(entries), [entries]);
  const classCounts = useMemo(() => statusClassCounts(entries), [entries]);
  const mCounts = useMemo(() => methodCounts(entries), [entries]);
  const iCounts = useMemo(() => initiatorCounts(entries), [entries]);
  const range = useMemo(() => networkTimeRange(entries), [entries]);

  // Seeded once from the route; the pane owns its filter state from then on (S4-26).
  const [activeClasses, setActiveClasses] = useState<ReadonlySet<string>>(() =>
    seedSet(initialFilters?.classes, classes),
  );
  const [activeMethods, setActiveMethods] = useState<ReadonlySet<string>>(() =>
    seedSet(initialFilters?.methods, methods),
  );
  const [activeInitiators, setActiveInitiators] = useState<ReadonlySet<NetworkInitiator>>(() =>
    seedSet(initialFilters?.initiators, initiators),
  );
  const [query, setQuery] = useState(initialFilters?.query ?? '');
  const [useRegex, setUseRegex] = useState(initialFilters?.useRegex ?? false);
  const [selectedId, setSelectedId] = useState<string | null>(initialFilters?.selectedId ?? null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Report the whole filter state on any change — chips, search, regex and selection alike.
  useEffect(() => {
    onFiltersChange?.({
      classes: activeClasses,
      methods: activeMethods,
      initiators: activeInitiators,
      query,
      useRegex,
      selectedId,
    });
  }, [
    onFiltersChange,
    activeClasses,
    activeMethods,
    activeInitiators,
    query,
    useRegex,
    selectedId,
  ]);

  const compiled = useMemo(
    () => (query ? compileSearch(query, useRegex) : null),
    [query, useRegex],
  );
  const invalidRegex = compiled !== null && !compiled.valid;

  const visible = useMemo(() => {
    const matcher = compiled === null ? null : compiled.valid ? compiled.match : () => false;
    return filterNetwork(entries, {
      statusClasses: activeClasses,
      methods: activeMethods,
      initiators: activeInitiators,
      matcher,
    });
  }, [entries, activeClasses, activeMethods, activeInitiators, compiled]);

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
    idPrefix: 'network-option',
    activeIndex,
    onActiveIndexChange: (index) => setSelectedId(visible[index]?.id ?? null),
    // Without this, aria-activedescendant can name a row the virtual window hasn't rendered yet:
    // useVirtualWindow only recomputes on a throttled native `scroll` event, which a programmatic
    // `scrollTop` assignment never fires (and jsdom never fires at all).
    onScrollSync: onScroll,
  });

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const totalMs = range === null ? 0 : range.maxMs - range.minMs;

  function toggle<T>(
    setter: (updater: (prev: ReadonlySet<T>) => ReadonlySet<T>) => void,
    value: T,
  ) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  async function copyCurl(entry: NetworkEntry): Promise<void> {
    if (!navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(toCurl(entry));
      setCopiedId(entry.id);
    } catch {
      // Clipboard unavailable / denied — leave the button in its default state.
    }
  }

  function startOffsetOf(entry: NetworkEntry): number {
    if (range === null) {
      return 0;
    }
    const ms = Date.parse(entry.startedAt);
    return Number.isNaN(ms) ? 0 : ms - range.minMs;
  }

  if (entries.length === 0) {
    return (
      <section data-testid="network-pane" aria-label="Network" className="flex h-full flex-col p-4">
        <AsyncState
          status="empty"
          empty={
            <p data-testid="network-empty" className="text-[var(--bc-fg-muted)]">
              No network entries captured.
            </p>
          }
        />
      </section>
    );
  }

  return (
    <section data-testid="network-pane" aria-label="Network" className="flex h-full flex-col p-4">
      <div
        role="group"
        aria-label="Network filters"
        className="mb-3 flex flex-wrap items-center gap-3"
      >
        <div role="group" aria-label="Status" className="flex gap-1">
          {classes.map((cls) => {
            const on = activeClasses.has(cls);
            return (
              <button
                key={cls}
                type="button"
                data-testid={`network-status-${cls}`}
                aria-pressed={on}
                aria-label={`${cls} (${classCounts[cls]})`}
                onClick={() => toggle(setActiveClasses, cls)}
                style={on ? { backgroundColor: statusClassColor(cls), color: '#fff' } : undefined}
                className={`rounded px-2 py-0.5 font-mono text-xs ${
                  on ? '' : 'border border-[var(--bc-border-strong)] text-[var(--bc-fg-muted)]'
                }`}
              >
                {cls} {classCounts[cls]}
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Method" className="flex gap-1">
          {methods.map((method) => {
            const on = activeMethods.has(method);
            return (
              <button
                key={method}
                type="button"
                data-testid={`network-method-${method}`}
                aria-pressed={on}
                aria-label={`${method} (${mCounts[method]})`}
                onClick={() => toggle(setActiveMethods, method)}
                className={`rounded px-2 py-0.5 font-mono text-xs ${
                  on
                    ? 'bg-[var(--bc-accent)] text-[var(--bc-accent-fg)]'
                    : 'border border-[var(--bc-border-strong)] text-[var(--bc-fg-muted)]'
                }`}
              >
                {method} {mCounts[method]}
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Initiator" className="flex gap-1">
          {initiators.map((initiator) => {
            const on = activeInitiators.has(initiator);
            return (
              <button
                key={initiator}
                type="button"
                data-testid={`network-initiator-${initiator}`}
                aria-pressed={on}
                aria-label={`${initiator} (${iCounts[initiator]})`}
                onClick={() => toggle(setActiveInitiators, initiator)}
                className={`rounded px-2 py-0.5 font-mono text-xs ${
                  on
                    ? 'bg-[var(--bc-accent)] text-[var(--bc-accent-fg)]'
                    : 'border border-[var(--bc-border-strong)] text-[var(--bc-fg-muted)]'
                }`}
              >
                {initiator} {iCounts[initiator]}
              </button>
            );
          })}
        </div>

        <input
          type="search"
          data-testid="network-search"
          aria-label="Search network"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-[160px] flex-1 rounded border border-[var(--bc-border-strong)] bg-[var(--bc-bg)] px-2 py-1 text-sm text-[var(--bc-fg)]"
        />
        <label className="flex items-center gap-1 text-sm text-[var(--bc-fg)]">
          <input
            type="checkbox"
            data-testid="network-regex"
            checked={useRegex}
            onChange={(event) => setUseRegex(event.target.checked)}
          />
          Regex
        </label>

        <span data-testid="network-count" className="text-xs text-[var(--bc-fg-muted)]">
          {visible.length} of {entries.length}
        </span>
      </div>

      {invalidRegex ? (
        <p
          data-testid="network-invalid-regex"
          role="alert"
          className="mb-2 text-sm text-[var(--bc-danger)]"
        >
          Invalid regular expression.
        </p>
      ) : null}

      <div
        aria-hidden="true"
        className="flex items-center gap-3 px-3 pb-1 text-xs font-semibold text-[var(--bc-fg-muted)]"
      >
        <span className="w-14 shrink-0">Method</span>
        <span className="w-14 shrink-0">Status</span>
        <span className="min-w-0 flex-[2]">URL</span>
        <span className="w-16 shrink-0 text-right">Size</span>
        <span className="w-16 shrink-0 text-right">Time</span>
        <span className="min-w-0 flex-1">Waterfall</span>
      </div>

      <div
        ref={containerRef}
        onScroll={onScroll}
        data-testid="network-list"
        aria-label="Network requests"
        {...listProps}
        className="flex-1 overflow-auto rounded border border-[var(--bc-border)] outline-none"
      >
        {visible.length === 0 ? null : (
          <div style={{ paddingTop: vwin.padTop, paddingBottom: vwin.padBottom }}>
            {visible.slice(vwin.startIndex, vwin.endIndex + 1).map((entry, offset) => {
              const index = vwin.startIndex + offset;
              const cls = statusClass(entry);
              const current = entry.id === selectedId;
              return (
                <div
                  key={entry.id}
                  id={optionId(index)}
                  role="option"
                  tabIndex={-1}
                  data-testid="network-row"
                  aria-selected={current}
                  aria-label={`${entry.method} ${statusLabel(entry)} ${entry.url} ${durationLabel(entry)}`}
                  onClick={() => setSelectedId(entry.id)}
                  style={{ height: ROW_H }}
                  className={`flex w-full cursor-pointer items-center gap-3 border-l-2 px-3 text-left font-mono text-sm ${
                    current
                      ? 'border-[var(--bc-accent)] bg-[var(--bc-surface)]'
                      : 'border-transparent'
                  }`}
                >
                  <span className="w-14 shrink-0 text-[var(--bc-fg-muted)]">{entry.method}</span>
                  <span className="w-14 shrink-0" style={{ color: statusClassColor(cls) }}>
                    {statusLabel(entry)}
                  </span>
                  <span className="min-w-0 flex-[2] truncate text-[var(--bc-fg)]">{entry.url}</span>
                  <span className="w-16 shrink-0 text-right text-[var(--bc-fg-muted)]">
                    {sizeLabel(entry)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[var(--bc-fg-muted)]">
                    {durationLabel(entry)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Waterfall
                      startOffsetMs={startOffsetOf(entry)}
                      durationMs={entry.durationMs}
                      totalMs={totalMs}
                      cls={cls}
                      label={entry.durationMs === null ? 'failed' : `${entry.durationMs} ms`}
                    />
                  </span>
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
        <p data-testid="network-no-matches" className="p-3 text-sm text-[var(--bc-fg-muted)]">
          No requests match the current filters.
        </p>
      ) : null}

      <div
        data-testid="network-detail"
        className="mt-3 max-h-72 overflow-auto rounded border border-[var(--bc-border)] p-3"
      >
        {selected ? (
          <div className="space-y-3">
            <div>
              <p className="font-mono text-sm text-[var(--bc-fg)]">
                <span className="text-[var(--bc-fg-muted)]">{selected.method}</span>{' '}
                <span style={{ color: statusClassColor(statusClass(selected)) }}>
                  {statusLabel(selected)}
                </span>
                {selected.statusText ? ` ${selected.statusText}` : ''}
                {` · ${selected.initiator} · ${durationLabel(selected)}`}
                {selected.fromCache ? ' · from cache' : ''}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-[var(--bc-fg-muted)]">
                {selected.url}
              </p>
              {selected.errorText ? (
                <p className="mt-1 text-xs text-[var(--bc-danger)]">{selected.errorText}</p>
              ) : null}
              <button
                type="button"
                data-testid="network-curl"
                onClick={() => void copyCurl(selected)}
                className="mt-2 rounded border border-[var(--bc-border-strong)] px-2 py-0.5 text-xs text-[var(--bc-fg)]"
              >
                {copiedId === selected.id ? 'Copied' : 'Copy as cURL'}
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-[var(--bc-fg-muted)]">Request headers</p>
              <HeaderList
                headers={selected.requestHeaders}
                testId="network-req-header"
                label="Request headers"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--bc-fg-muted)]">Response headers</p>
              <HeaderList
                headers={selected.responseHeaders}
                testId="network-resp-header"
                label="Response headers"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--bc-fg-muted)]">Request body</p>
              <BodyView body={selected.request} testId="network-req-body" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--bc-fg-muted)]">Response body</p>
              <BodyView body={selected.response} testId="network-resp-body" />
            </div>
          </div>
        ) : (
          <p data-testid="network-detail-empty" className="text-sm text-[var(--bc-fg-muted)]">
            Select a request to see its headers, body, and cURL.
          </p>
        )}
      </div>
    </section>
  );
}
