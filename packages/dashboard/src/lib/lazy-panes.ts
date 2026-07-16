import { lazy } from 'react';

/**
 * Pane-level code splitting (S4-05). Each pane is a `React.lazy` chunk so the router only loads the
 * active pane's code — Vite emits one JS chunk per dynamic import. This is the pattern every later
 * pane ticket (S4-06 … S4-13) follows: add its pane here as a `Lazy*` entry and render it behind the
 * shared `<Suspense>` boundary in `App`.
 */

export const LazyOverviewPane = lazy(() =>
  import('../panes/OverviewPane').then((m) => ({ default: m.OverviewPane })),
);

export const LazyConsolePane = lazy(() =>
  import('../panes/ConsolePane').then((m) => ({ default: m.ConsolePane })),
);

export const LazyNetworkPane = lazy(() =>
  import('../panes/NetworkPane').then((m) => ({ default: m.NetworkPane })),
);

export const LazyScreenshotsPane = lazy(() =>
  import('../panes/ScreenshotsPane').then((m) => ({ default: m.ScreenshotsPane })),
);

export const LazyPanePlaceholder = lazy(() =>
  import('../panes/PanePlaceholder').then((m) => ({ default: m.PanePlaceholder })),
);
