/**
 * Pure hash-router core for the dashboard shell (S4-01). No React, no DOM — so it is unit-testable
 * in a plain node environment and reusable by the self-contained report.html template later.
 *
 * Hash format: `#/<pane>[/<reportId>][?<query>]`. The report id is parsed defensively — it is the
 * seam for multi-ZIP tabs (S4-02) and sharing via URL hash (S4-15). The optional query carries
 * pane-scoped params (S4-09: the DOM pane's `?el=<selector>` open-at-element deep-link); it is
 * additive — hashes without a query parse exactly as before.
 */

export type DashboardPane =
  | 'overview'
  | 'screenshots'
  | 'console'
  | 'network'
  | 'dom'
  | 'reproduction'
  | 'storage'
  | 'privacy';

export interface RouteState {
  readonly activePane: DashboardPane;
  readonly reportId: string | null;
  /** Pane-scoped query params (e.g. the DOM pane's `el`); omitted when the hash has none. */
  readonly params?: Readonly<Record<string, string>>;
}

/** Panes in side-nav order. Overview is the default/first pane. */
export const DASHBOARD_PANES: readonly DashboardPane[] = [
  'overview',
  'screenshots',
  'console',
  'network',
  'dom',
  'reproduction',
  'storage',
  'privacy',
];

/** Human-readable side-nav labels, keyed by pane. */
export const PANE_LABELS: Record<DashboardPane, string> = {
  overview: 'Overview',
  screenshots: 'Screenshots',
  console: 'Console',
  network: 'Network',
  dom: 'DOM',
  reproduction: 'Reproduction',
  storage: 'Storage',
  privacy: 'Privacy',
};

const PANE_SET = new Set<string>(DASHBOARD_PANES);

function isDashboardPane(value: string | undefined): value is DashboardPane {
  return value !== undefined && PANE_SET.has(value);
}

function decodeReportId(segment: string | undefined): string | null {
  if (!segment) {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    // Malformed percent-encoding — treat as no report id rather than throwing.
    return null;
  }
}

/** Parse the hash's query string into a params record; `undefined` when it has no entries. */
function decodeParams(query: string | undefined): Readonly<Record<string, string>> | undefined {
  if (!query) {
    return undefined;
  }
  // URLSearchParams never throws: malformed percent-encoding decodes to replacement characters.
  const entries = [...new URLSearchParams(query)];
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Parse a `window.location.hash` (with or without the leading `#`) into a {@link RouteState}.
 * Unknown or malformed input falls back to the overview pane; never throws.
 */
export function parseHash(hash: string): RouteState {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const params = decodeParams(queryStart === -1 ? undefined : raw.slice(queryStart + 1));
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const activePane = isDashboardPane(segments[0]) ? segments[0] : 'overview';
  const reportId = decodeReportId(segments[1]);
  return params ? { activePane, reportId, params } : { activePane, reportId };
}

/** Inverse of {@link parseHash}: build the hash for a route (nav hrefs, deep-links, sharing). */
export function formatHash(state: RouteState): string {
  const base = `#/${state.activePane}`;
  const withId = state.reportId ? `${base}/${encodeURIComponent(state.reportId)}` : base;
  const query = new URLSearchParams(state.params ?? {}).toString();
  return query ? `${withId}?${query}` : withId;
}
