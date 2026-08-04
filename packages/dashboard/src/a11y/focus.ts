import { useEffect, useRef, useState, type RefObject } from 'react';

import { PANE_LABELS, type DashboardPane } from '../router/hash-router';

/**
 * The dashboard's focus entry point (S4-27).
 *
 * `getFocusable`/`useFocusTrap`/`useFocusRestore` used to be re-exported from here too, justified as
 * giving dashboard code "one import site" for focus primitives. Removed (S4-27 final review): no
 * dashboard file ever imported them through this module — the dashboard's own focus-trapping consumer
 * is `Lightbox`, which lives in `@bugcase/shared-ui` and imports them directly from its sibling
 * `a11y/focus.ts` there, never through here. If a dashboard file genuinely needs them later, import
 * from `@bugcase/shared-ui` directly — that package's `index.ts` is the real single source for those
 * primitives; this file re-stating it added an indirection with no consumer, not a convenience.
 */

/**
 * Move focus and announce when the route changes panes.
 *
 * A hash-router pane swap replaces the whole content region while focus stays on the nav link that
 * caused it, so a screen-reader user hears nothing and a keyboard user's next Tab resumes from the
 * nav rather than the content they just asked for. Focusing the content region fixes both; the
 * returned string feeds a `role="status"` live region so the change is spoken as well.
 *
 * The initial mount is deliberately skipped — the page has just loaded and is already being read.
 *
 * @param targetRef the content region, which must carry `tabIndex={-1}` to be programmatically
 *   focusable without becoming a tab stop.
 * @returns the announcement text, or `''` before the first pane change.
 */
export function useRouteFocus(pane: DashboardPane, targetRef: RefObject<HTMLElement>): string {
  const [announcement, setAnnouncement] = useState('');
  const previousPane = useRef<DashboardPane | null>(null);

  useEffect(() => {
    const previous = previousPane.current;
    previousPane.current = pane;

    // First mount: nothing has changed yet.
    if (previous === null || previous === pane) {
      return;
    }

    // `preventScroll` keeps the viewport where the user left it; the pane is already at the top.
    targetRef.current?.focus({ preventScroll: true });
    setAnnouncement(PANE_LABELS[pane]);
  }, [pane, targetRef]);

  return announcement;
}
