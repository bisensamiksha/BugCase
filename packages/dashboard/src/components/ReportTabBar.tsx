import type { DragEvent } from 'react';

import { formatHash, type DashboardPane } from '../router/hash-router';
import type { ReportTab } from '../state/report-tabs';

export interface ReportTabBarProps {
  readonly tabs: readonly ReportTab[];
  /** Id of the currently active report (drives the highlight). */
  readonly activeId: string | null;
  /** Current pane — kept in each tab's href so switching tabs preserves the pane. */
  readonly activePane: DashboardPane;
  readonly onClose: (id: string) => void;
  readonly onReorder: (fromId: string, toId: string) => void;
  readonly onAdd: () => void;
}

const DRAG_MIME = 'text/plain';

/**
 * Open-report tab strip (S4-02), mounted into the S4-01 top-bar slot. Activation is href-driven
 * (like the side nav) so the URL stays the single source of truth for the active report; close and
 * native drag-to-reorder are callbacks. Presentational — holds no state.
 */
export function ReportTabBar({
  tabs,
  activeId,
  activePane,
  onClose,
  onReorder,
  onAdd,
}: ReportTabBarProps) {
  function onDragStart(event: DragEvent, id: string): void {
    event.dataTransfer.setData(DRAG_MIME, id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(event: DragEvent, toId: string): void {
    event.preventDefault();
    const fromId = event.dataTransfer.getData(DRAG_MIME);
    if (fromId) {
      onReorder(fromId, toId);
    }
  }

  return (
    /*
     * `aria-label` on a role-less `<div>` (ARIA's `role="generic"`) is dropped by assistive tech,
     * so the strip was unnamed in practice — that part of the brief's diagnosis is right. But the
     * prescribed fix, `role="tablist"`, is wrong: ARIA requires a `tablist` to own `role="tab"`
     * children controlling a `tabpanel`, and this strip's children are plain `<a href>` navigation
     * links (activation is href-driven — the URL is the source of truth for the active report) plus
     * a close `<button>` each, not tabs. Empirically, adding `role="tablist"` here makes axe-core's
     * `aria-required-children` rule fail with impact "critical" ("Element has children which are not
     * allowed: button[aria-label], a[aria-current], a") — confirmed via a throwaway axe.run before
     * this fix landed. A `<nav>` is a landmark element (implicit role, unlike `<div>`), so
     * `aria-label` reaches assistive tech without inventing any ARIA roles; axe-core reports zero
     * violations on it, and its accessible name resolves to "Open reports" via axe's own
     * accessible-name computation (`axe.commons.text.accessibleText`). See the "gives the tab strip
     * an accessible name via a landmark" test below for both checks in place.
     */
    <nav
      data-testid="report-tab-bar"
      aria-label="Open reports"
      className="flex min-w-0 items-center gap-1 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <span
            key={tab.id}
            draggable
            onDragStart={(event) => onDragStart(event, tab.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(event, tab.id)}
            className={`inline-flex max-w-[12rem] shrink-0 items-center gap-1 rounded-[var(--bc-radius)] px-2 py-1 text-sm ${
              active
                ? 'bg-[var(--bc-accent)] text-[var(--bc-accent-fg)]'
                : 'bg-[var(--bc-bg)] text-[var(--bc-fg)]'
            }`}
          >
            <a
              data-testid={`report-tab-${tab.id}`}
              href={formatHash({ activePane, reportId: tab.id })}
              aria-current={active ? 'page' : undefined}
              title={tab.label}
              className="truncate"
            >
              {tab.label}
            </a>
            <button
              type="button"
              data-testid={`report-tab-close-${tab.id}`}
              aria-label={`Close ${tab.label}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose(tab.id);
              }}
              className="shrink-0 rounded px-1 leading-none opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </span>
        );
      })}
      <button
        type="button"
        data-testid="report-tab-add"
        aria-label="Open more reports"
        onClick={onAdd}
        className="shrink-0 rounded-[var(--bc-radius)] px-2 py-1 text-sm text-[var(--bc-fg-muted)] hover:bg-[var(--bc-bg)]"
      >
        +
      </button>
    </nav>
  );
}
