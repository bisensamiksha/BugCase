import { useEffect, useRef, useState, type RefObject } from 'react';

import { PANE_LABELS, type DashboardPane } from '../router/hash-router';

/**
 * The dashboard's focus entry point (S4-27).
 *
 * The generic primitives live in `@bugcase/shared-ui` because `Lightbox` needs them and shared-ui
 * cannot depend on the dashboard. They are re-exported here so dashboard code has one import site.
 */
export { getFocusable, useFocusRestore, useFocusTrap } from '@bugcase/shared-ui';

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
