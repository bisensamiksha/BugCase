import { useEffect, useMemo, useRef } from 'react';

import { formatHash, type RouteState } from './hash-router';

/**
 * Reflect pane filter state into the URL hash (S4-26).
 *
 * Two deliberate choices:
 *
 * - **`history.replaceState`, not `location.hash =`.** Assigning the hash fires `hashchange`, which
 *   `useHashRoute` would re-parse and feed straight back into the pane — fighting the user mid-
 *   keystroke. `replaceState` fires no event, so the pane is never handed its own writes.
 * - **Replace rather than push.** Filtering would otherwise bury the previous pane under one
 *   history entry per keystroke. Back should return to where you came from, not replay your typing.
 *
 * The trade-off is that Back does not undo a filter change. That is the right call for typing and
 * the wrong one for someone expecting per-filter undo; it is a conscious choice, not an oversight.
 */

/** Long enough to coalesce typing, short enough that the URL is current when you go to copy it. */
export const HASH_WRITE_DEBOUNCE_MS = 250;

export interface HashParamWriter {
  write(params: Record<string, string>): void;
  dispose(): void;
}

/**
 * Build a debounced writer. `getRoute` is read at flush time, not at creation, so a write queued
 * just before a navigation still formats against the route it lands in.
 */
export function createHashParamWriter(getRoute: () => RouteState): HashParamWriter {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Record<string, string> | undefined;

  const flush = () => {
    timer = undefined;
    if (pending === undefined) {
      return;
    }
    const next = formatHash({ ...getRoute(), params: pending });
    pending = undefined;

    // Nothing to do when the URL already says this — avoids churning history on mount, when every
    // pane reports its (unchanged) initial state.
    const current = `${window.location.hash || '#'}`;
    if (current === next) {
      return;
    }

    try {
      window.history.replaceState(null, '', next);
    } catch {
      // Some embedding contexts refuse history writes; the view still works, the URL just lags.
    }
  };

  return {
    write(params) {
      pending = params;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, HASH_WRITE_DEBOUNCE_MS);
    },
    dispose() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      pending = undefined;
    },
  };
}

/**
 * React binding for {@link createHashParamWriter}. Returns a stable `write` so panes can depend on
 * it in an effect without re-reporting on every render.
 */
export function useHashParamWriter(route: RouteState): (params: Record<string, string>) => void {
  // Keep the latest route readable at flush time without rebuilding the writer, which would drop a
  // pending write on every navigation.
  const routeRef = useRef(route);
  routeRef.current = route;

  const writer = useMemo(() => createHashParamWriter(() => routeRef.current), []);

  useEffect(
    () => () => {
      writer.dispose();
    },
    [writer],
  );

  return useMemo(() => writer.write.bind(writer), [writer]);
}
