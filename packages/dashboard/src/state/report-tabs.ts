import type { BugReportV1 } from '@bugcase/schema';

/**
 * Multi-report tab state for the dashboard (S4-02). Pure — no React, no DOM — so the tab set, its
 * order, and label derivation are unit-testable in isolation. The "which tab is active" selection
 * lives in the URL (`RouteState.reportId`), not here; this module only owns the open set + order.
 */
export interface ReportTab {
  /** Stable per-report id — the capture id, so re-opening the same report dedupes. */
  readonly id: string;
  /** Human-readable tab label. */
  readonly label: string;
  readonly report: BugReportV1;
}

interface PageMeta {
  readonly title?: string | null;
  readonly origin?: string | null;
}
interface ReportMeta {
  readonly id?: string;
  readonly page?: PageMeta;
}

function metaOf(report: BugReportV1): ReportMeta {
  return (report as { metadata?: ReportMeta }).metadata ?? {};
}

/** First non-empty of: page title, origin, source filename, then a generic fallback. */
function deriveLabel(meta: ReportMeta, fallbackName?: string): string {
  return meta.page?.title || meta.page?.origin || fallbackName || 'Report';
}

/** Build a {@link ReportTab} from a validated report. Defensive against missing metadata. */
export function makeReportTab(report: BugReportV1, fallbackName?: string): ReportTab {
  const meta = metaOf(report);
  return {
    id: meta.id || crypto.randomUUID(),
    label: deriveLabel(meta, fallbackName),
    report,
  };
}

/** Append a tab, unless one with the same id is already open (existing wins — no duplicate). */
export function addReportTab(tabs: readonly ReportTab[], tab: ReportTab): readonly ReportTab[] {
  return tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab];
}

/** Remove the tab with the given id (no-op if absent). */
export function closeReportTab(tabs: readonly ReportTab[], id: string): readonly ReportTab[] {
  return tabs.some((t) => t.id === id) ? tabs.filter((t) => t.id !== id) : tabs;
}

/** Move `fromId` to just before `toId`. No-op for unknown ids or a self-move. */
export function reorderReportTabs(
  tabs: readonly ReportTab[],
  fromId: string,
  toId: string,
): readonly ReportTab[] {
  const from = tabs.findIndex((t) => t.id === fromId);
  const to = tabs.findIndex((t) => t.id === toId);
  if (from < 0 || to < 0 || from === to) {
    return tabs;
  }
  const next = tabs.slice();
  const [moved] = next.splice(from, 1);
  const insertAt = next.findIndex((t) => t.id === toId);
  next.splice(insertAt, 0, moved as ReportTab);
  return next;
}

/** The tab id to activate after closing `id`: the next tab, else the previous, else null. */
export function neighborTabId(tabs: readonly ReportTab[], id: string): string | null {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) {
    return null;
  }
  const next = tabs[i + 1] ?? tabs[i - 1];
  return next ? next.id : null;
}

/** Look up a tab by id; returns undefined for a null/missing id. */
export function findTab(tabs: readonly ReportTab[], id: string | null): ReportTab | undefined {
  return id === null ? undefined : tabs.find((t) => t.id === id);
}
