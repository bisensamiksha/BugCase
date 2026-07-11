/**
 * Pure hash-router core for the dashboard shell (S4-01). No React, no DOM — so it is unit-testable
 * in a plain node environment and reusable by the self-contained report.html template later.
 *
 * Hash format: `#/<pane>` with an optional `#/<pane>/<reportId>`. The report id is parsed defensively
 * but not yet consumed — it is the forward-compatible seam for multi-ZIP tabs (S4-02) and sharing
 * via URL hash (S4-13).
 */

export type DashboardPane =
  | 'overview'
  | 'screenshots'
  | 'console'
  | 'network'
  | 'dom'
  | 'storage'
  | 'privacy';

export interface RouteState {
  readonly activePane: DashboardPane;
  readonly reportId: string | null;
}

/** Panes in side-nav order. Overview is the default/first pane. */
export const DASHBOARD_PANES: readonly DashboardPane[] = [
  'overview',
  'screenshots',
  'console',
  'network',
  'dom',
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

/**
 * Parse a `window.location.hash` (with or without the leading `#`) into a {@link RouteState}.
 * Unknown or malformed input falls back to the overview pane; never throws.
 */
export function parseHash(hash: string): RouteState {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const segments = raw.split('/').filter((segment) => segment.length > 0);
  const activePane = isDashboardPane(segments[0]) ? segments[0] : 'overview';
  return { activePane, reportId: decodeReportId(segments[1]) };
}

/** Inverse of {@link parseHash}: build the hash for a route (nav hrefs, future sharing). */
export function formatHash(state: RouteState): string {
  const base = `#/${state.activePane}`;
  return state.reportId ? `${base}/${encodeURIComponent(state.reportId)}` : base;
}
