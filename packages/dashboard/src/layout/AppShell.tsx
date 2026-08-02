import type { ReactNode } from 'react';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { ThemeToggle } from '../components/ThemeToggle';
import { DASHBOARD_PANES, PANE_LABELS, formatHash, type RouteState } from '../router/hash-router';

export interface AppShellProps {
  /** Current route — drives the active side-nav highlight and nav hrefs. */
  readonly route: RouteState;
  /** Active pane content, owned by the caller. */
  readonly children: ReactNode;
  /** Optional content for the top-bar slot — the multi-ZIP tab strip (S4-02). */
  readonly tabs?: ReactNode;
}

/**
 * Presentational dashboard shell (S4-01): a top bar, a data-driven left side nav across the report
 * panes, and a content region. Layout is Tailwind; color comes from the `--bc-*` theming tokens so
 * the shell follows light/dark automatically. It holds no report or routing state of its own.
 */
export function AppShell({ route, children, tabs }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bc-bg)] text-[var(--bc-fg)]">
      <header
        data-testid="app-topbar"
        className="flex items-center gap-3 border-b border-[var(--bc-border)] bg-[var(--bc-surface)] px-4 py-3"
      >
        <h1 className="text-base font-bold">BugCase Dashboard</h1>
        <p className="hidden text-xs text-[var(--bc-fg-muted)] sm:block">
          Everything runs in your browser — nothing is uploaded.
        </p>
        {/* Multi-ZIP tab strip (S4-02). */}
        <div
          data-testid="app-topbar-slot"
          className="ml-4 flex min-w-0 flex-1 items-center overflow-x-auto"
        >
          {tabs}
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1">
        <nav
          data-testid="app-sidenav"
          aria-label="Report sections"
          className="w-44 shrink-0 border-r border-[var(--bc-border)] bg-[var(--bc-surface)] p-2"
        >
          <ul className="space-y-1">
            {DASHBOARD_PANES.map((pane) => {
              const active = pane === route.activePane;
              return (
                <li key={pane}>
                  <a
                    data-testid={`nav-${pane}`}
                    href={formatHash({ activePane: pane, reportId: route.reportId })}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-[var(--bc-radius)] px-3 py-1.5 text-sm ${
                      active
                        ? 'bg-[var(--bc-accent)] text-[var(--bc-accent-fg)]'
                        : 'text-[var(--bc-fg)] hover:bg-[var(--bc-bg)]'
                    }`}
                  >
                    {PANE_LABELS[pane]}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <main data-testid="app-content" className="min-w-0 flex-1 p-4">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      <footer
        data-testid="legal-footer"
        className="border-t border-[var(--bc-border)] bg-[var(--bc-surface)] px-4 py-2 text-xs text-[var(--bc-fg-muted)]"
      >
        <a
          className="underline"
          href="https://bisensamiksha.github.io/BugCase/legal/privacy-policy"
        >
          Privacy Policy
        </a>
        {' · '}
        <a className="underline" href="https://bisensamiksha.github.io/BugCase/legal/terms">
          Terms of Use
        </a>
      </footer>
    </div>
  );
}
