import type { DomSnapshot } from '@bugcase/schema';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AsyncState, type AsyncStatus } from '../components/AsyncState';
import { SandboxFrame } from '../components/SandboxFrame';
import { formatByteSize } from '../lib/format-bytes';
import type { ReportSource } from '../lib/report-source';
import { highlightHtml, type HighlightResult } from '../lib/shiki';
import type { DomTab, DomViewState } from '../router/hash-state';

import {
  elementBreadcrumb,
  elementSnippet,
  markedSnapshotHtml,
  parseHtmlDocument,
  searchElements,
} from './dom-search';

export interface DomPaneProps {
  /** The report's `dom` manifest entry; `null` renders the empty state. */
  readonly dom: DomSnapshot | null;
  readonly reportId: string;
  /** Lazy ZIP access (S4-05); the snapshot text is read on demand from `dom.contentPath`. */
  readonly source: ReportSource;
  /** `?el=` deep-link selector (S4-11 seam): pre-fills the search and selects the first match. */
  readonly initialElementQuery?: string | null;
  /** `?tab=` from the hash (S4-26); anything but `source` opens the rendered view. */
  readonly initialTab?: DomTab;
  /** Called when the tab or element query changes, so the caller can reflect it into the hash. */
  readonly onViewChange?: (state: DomViewState) => void;
}

type SnapshotTab = 'rendered' | 'source';

const TAB_IDS: Record<SnapshotTab, { tab: string; panel: string }> = {
  rendered: { tab: 'dom-tab-rendered', panel: 'dom-panel-rendered' },
  source: { tab: 'dom-tab-source', panel: 'dom-panel-source' },
};

/**
 * DOM snapshot pane (S4-09). Renders the scrubbed snapshot two ways — a fully locked sandboxed
 * iframe (shared `SandboxFrame`) and a lazily Shiki-highlighted raw source view — plus CSS-selector
 * element search over an inert `DOMParser` copy. The active match is baked into the preview srcDoc
 * as an outline (the sandbox permits no scripts, so nothing can be highlighted live), and the
 * `?el=` hash param deep-links straight to a match.
 */
export function DomPane({
  dom,
  source,
  initialElementQuery,
  initialTab,
  onViewChange,
}: DomPaneProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState(initialElementQuery ?? '');
  const [activeIndex, setActiveIndex] = useState(0);
  const [tab, setTab] = useState<SnapshotTab>(initialTab === 'source' ? 'source' : 'rendered');
  const [highlight, setHighlight] = useState<HighlightResult | null>(null);
  const renderedTabRef = useRef<HTMLButtonElement>(null);
  const sourceTabRef = useRef<HTMLButtonElement>(null);

  const contentPath = dom?.contentPath ?? null;

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setLoadFailed(false);
    setHighlight(null);
    if (contentPath === null) {
      return;
    }
    source
      .readText(contentPath)
      .then((text) => {
        if (cancelled) {
          return;
        }
        if (text === null) {
          setLoadFailed(true);
        } else {
          setHtml(text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, contentPath]);

  // Re-apply the deep-link whenever it changes: the pane may already be mounted when S4-11 links
  // to another element (`#/dom/<id>?el=…` fires as a hashchange, not a remount). A user's typed
  // query is never clobbered — this runs only when the param itself changes.
  useEffect(() => {
    if (initialElementQuery != null && initialElementQuery !== '') {
      setQuery(initialElementQuery);
      setActiveIndex(0);
    }
  }, [initialElementQuery]);

  // Highlight lazily, once per snapshot, and only when the Source tab first needs it.
  useEffect(() => {
    if (tab !== 'source' || html === null || highlight !== null) {
      return;
    }
    let cancelled = false;
    void highlightHtml(html).then((result) => {
      if (!cancelled) {
        setHighlight(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tab, html, highlight]);

  const doc = useMemo(() => (html === null ? null : parseHtmlDocument(html)), [html]);
  const hasQuery = query.trim() !== '';
  const search = useMemo(
    () => (doc && hasQuery ? searchElements(doc, query) : null),
    [doc, hasQuery, query],
  );
  const matches = search?.ok ? search.matches : [];
  const activeMatch = matches.length > 0 ? matches[activeIndex % matches.length] : undefined;

  // The preview stays byte-faithful raw text unless a match is outlined into a marked copy.
  const previewHtml = useMemo(() => {
    if (html === null) {
      return null;
    }
    if (activeMatch === undefined) {
      return html;
    }
    return markedSnapshotHtml(html, query, activeIndex % matches.length) ?? html;
  }, [html, activeMatch, query, activeIndex, matches.length]);

  // Report the shareable view state (S4-26). The element query is the pane's search box — the same
  // value the `?el=` deep-link seeds — so one param round-trips both directions.
  useEffect(() => {
    onViewChange?.({ elementQuery: query, tab });
  }, [onViewChange, query, tab]);

  if (dom === null) {
    return (
      <section data-testid="dom-snapshot-pane" aria-label="DOM snapshot" className="h-full p-4">
        <AsyncState
          status="empty"
          empty={
            <p data-testid="dom-empty" className="text-[var(--bc-fg-muted)]">
              No DOM snapshot captured.
            </p>
          }
        />
      </section>
    );
  }

  const status: AsyncStatus = loadFailed ? 'error' : html === null ? 'loading' : 'ready';

  function selectTab(next: SnapshotTab): void {
    setTab(next);
    (next === 'rendered' ? renderedTabRef : sourceTabRef).current?.focus();
  }

  function onTablistKeyDown(event: React.KeyboardEvent): void {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      // Two tabs: every navigation key lands on the other one except Home/End's fixed targets.
      const next =
        event.key === 'Home'
          ? 'rendered'
          : event.key === 'End'
            ? 'source'
            : tab === 'rendered'
              ? 'source'
              : 'rendered';
      selectTab(next);
    }
  }

  return (
    <section
      data-testid="dom-snapshot-pane"
      aria-label="DOM snapshot"
      className="flex h-full flex-col gap-3 p-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-[var(--bc-fg)]">DOM snapshot</h2>
        <p data-testid="dom-scrub-note" className="text-sm text-[var(--bc-fg-muted)]">
          {formatByteSize(dom.byteSize)} · Rendered in a locked sandbox (no scripts, no network).
          {dom.scrubbed
            ? ` Inputs were scrubbed${dom.scrubberHits > 0 ? ` (${dom.scrubberHits} masked).` : '.'}`
            : ''}
        </p>
      </div>

      <AsyncState
        status={status}
        loadingLabel="Loading DOM snapshot…"
        errorMessage="Couldn't load this DOM snapshot."
      >
        {html !== null && previewHtml !== null ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="dom-search" className="text-sm text-[var(--bc-fg)]">
                Search elements (CSS selector)
              </label>
              <input
                id="dom-search"
                data-testid="dom-search-input"
                type="search"
                value={query}
                placeholder="e.g. main .card > button"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                className="min-w-56 rounded-[var(--bc-radius)] border border-[var(--bc-border-strong)] bg-[var(--bc-surface)] px-2 py-1 text-sm text-[var(--bc-fg)]"
              />
              {search && !search.ok ? (
                <p
                  data-testid="dom-search-error"
                  role="alert"
                  className="text-sm text-[var(--bc-danger)]"
                >
                  {search.error}
                </p>
              ) : null}
              {search?.ok ? (
                <span data-testid="dom-match-count" className="text-sm text-[var(--bc-fg-muted)]">
                  {matches.length === 0
                    ? '0 matches'
                    : `${(activeIndex % matches.length) + 1} of ${matches.length} matches`}
                </span>
              ) : null}
              {matches.length > 0 ? (
                <>
                  <button
                    type="button"
                    data-testid="dom-match-prev"
                    aria-label="Previous match"
                    onClick={() => setActiveIndex((i) => (i - 1 + matches.length) % matches.length)}
                    className="rounded-[var(--bc-radius)] border border-[var(--bc-border-strong)] px-2 py-1 text-sm text-[var(--bc-fg)]"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    data-testid="dom-match-next"
                    aria-label="Next match"
                    onClick={() => setActiveIndex((i) => (i + 1) % matches.length)}
                    className="rounded-[var(--bc-radius)] border border-[var(--bc-border-strong)] px-2 py-1 text-sm text-[var(--bc-fg)]"
                  >
                    ↓
                  </button>
                </>
              ) : null}
            </div>

            {activeMatch !== undefined ? (
              <div className="rounded-[var(--bc-radius)] border border-[var(--bc-border)] bg-[var(--bc-surface)] p-2">
                <p
                  data-testid="dom-match-breadcrumb"
                  className="font-mono text-xs text-[var(--bc-fg-muted)]"
                >
                  {elementBreadcrumb(activeMatch)}
                </p>
                <pre
                  data-testid="dom-match-snippet"
                  className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-[var(--bc-fg)]"
                >
                  {elementSnippet(activeMatch)}
                </pre>
              </div>
            ) : null}

            <div
              role="tablist"
              aria-label="Snapshot views"
              onKeyDown={onTablistKeyDown}
              className="flex gap-1 border-b border-[var(--bc-border)]"
            >
              <button
                ref={renderedTabRef}
                type="button"
                role="tab"
                id={TAB_IDS.rendered.tab}
                data-testid={TAB_IDS.rendered.tab}
                aria-selected={tab === 'rendered'}
                aria-controls={TAB_IDS.rendered.panel}
                tabIndex={tab === 'rendered' ? 0 : -1}
                onClick={() => selectTab('rendered')}
                className={`rounded-t-[var(--bc-radius)] px-3 py-1 text-sm ${
                  tab === 'rendered'
                    ? 'bg-[var(--bc-surface)] font-semibold text-[var(--bc-accent)]'
                    : 'text-[var(--bc-fg-muted)]'
                }`}
              >
                Rendered
              </button>
              <button
                ref={sourceTabRef}
                type="button"
                role="tab"
                id={TAB_IDS.source.tab}
                data-testid={TAB_IDS.source.tab}
                aria-selected={tab === 'source'}
                aria-controls={TAB_IDS.source.panel}
                tabIndex={tab === 'source' ? 0 : -1}
                onClick={() => selectTab('source')}
                className={`rounded-t-[var(--bc-radius)] px-3 py-1 text-sm ${
                  tab === 'source'
                    ? 'bg-[var(--bc-surface)] font-semibold text-[var(--bc-accent)]'
                    : 'text-[var(--bc-fg-muted)]'
                }`}
              >
                Source
              </button>
            </div>

            <div
              role="tabpanel"
              id={TAB_IDS.rendered.panel}
              aria-labelledby={TAB_IDS.rendered.tab}
              hidden={tab !== 'rendered'}
              className="min-h-0 flex-1"
            >
              {tab === 'rendered' ? (
                <SandboxFrame
                  html={previewHtml}
                  title="DOM snapshot preview"
                  data-testid="dom-preview-frame"
                  className="h-full w-full rounded-[var(--bc-radius)] border border-[var(--bc-border)] bg-white"
                />
              ) : null}
            </div>
            <div
              role="tabpanel"
              id={TAB_IDS.source.panel}
              aria-labelledby={TAB_IDS.source.tab}
              hidden={tab !== 'source'}
              className="min-h-0 flex-1 overflow-auto rounded-[var(--bc-radius)] border border-[var(--bc-border)]"
            >
              {tab === 'source' ? (
                highlight === null ? (
                  <p role="status" className="p-3 text-sm text-[var(--bc-fg-muted)]">
                    Highlighting…
                  </p>
                ) : highlight.kind === 'highlighted' ? (
                  <div
                    data-testid="dom-source-highlighted"
                    className="text-xs [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:p-3"
                    // Shiki output only: every character of the snapshot is escaped into token
                    // spans, so no captured markup goes live here.
                    dangerouslySetInnerHTML={{ __html: highlight.html }}
                  />
                ) : (
                  <div className="p-3">
                    <p
                      data-testid="dom-source-too-large"
                      className="text-sm text-[var(--bc-fg-muted)]"
                    >
                      Source too large to highlight, showing plain text.
                    </p>
                    <pre
                      data-testid="dom-source-plain"
                      className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-[var(--bc-fg)]"
                    >
                      {html}
                    </pre>
                  </div>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </AsyncState>
    </section>
  );
}
