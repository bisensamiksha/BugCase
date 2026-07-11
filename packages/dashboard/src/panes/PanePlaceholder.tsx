import { PANE_LABELS, type DashboardPane } from '../router/hash-router';

export interface PanePlaceholderProps {
  /** The pane whose content has not been built yet. */
  readonly pane: DashboardPane;
}

/**
 * Neutral empty state for panes that arrive in later Sprint 4 tickets (screenshots, dom, storage,
 * privacy). Keeps the shell navigable without inventing throwaway pane content.
 */
export function PanePlaceholder({ pane }: PanePlaceholderProps) {
  return (
    <div
      data-testid="pane-placeholder"
      className="rounded-[var(--bc-radius)] border border-dashed border-[var(--bc-border)] p-8 text-center text-[var(--bc-fg-muted)]"
    >
      <p className="text-sm">The {PANE_LABELS[pane]} view isn’t available yet.</p>
    </div>
  );
}
