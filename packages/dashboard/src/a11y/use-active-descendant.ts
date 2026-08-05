import { useCallback, type KeyboardEvent, type RefObject } from 'react';

/** Rows to move per Page key when the container's height is unmeasurable (jsdom, pre-layout). */
const FALLBACK_PAGE_ROWS = 10;

export interface ActiveDescendantOptions {
  /** Total rows in the *filtered* list, not the rendered window. */
  readonly count: number;
  /** Fixed row height in px — the same value the virtual window is computed from. */
  readonly rowHeight: number;
  /** The scroll container. Must be the element `listProps` is spread onto. */
  readonly containerRef: RefObject<HTMLDivElement>;
  /** Prefix for generated option ids; must be unique within the document. */
  readonly idPrefix: string;
  /**
   * The currently active row index, owned by the consumer — controlled, like a `<select value>`.
   * **-1 means "no active option"** — pass it when nothing is selected yet, or when the
   * previously-active row has been filtered out. The hook treats a negative index the same as
   * `count === 0`: it omits `aria-activedescendant` rather than guessing at a row the user never
   * chose. The hook clamps the indices it produces itself (arrow/page/home/end all stay within
   * `[0, count - 1]`, so the first ArrowDown from -1 lands on row 0 and the first ArrowUp from -1
   * also lands on row 0 rather than wrapping), but it never re-validates a non-negative value
   * handed to it. If the consumer's `count` shrinks — e.g. a filter narrows the list — while
   * `activeIndex` still points past the new end, that is the CONSUMER's responsibility to
   * re-resolve (to a valid index, or back to -1) before the next render.
   */
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  /**
   * Called synchronously right after the hook sets `scrollTop`, so the virtual window recomputes in
   * the same tick and the row `aria-activedescendant` names is actually in the DOM. Consumers pass
   * `useVirtualWindow`'s `onScroll`. Without it the reference dangles for a frame or two on any jump
   * past the overscan buffer (Home/End/PageUp/PageDown) — `useVirtualWindow` only recomputes on the
   * container's rAF-throttled native `onScroll`, which lands after the `activeIndex` state commit
   * that writes the new `aria-activedescendant`, and jsdom never fires that event on a programmatic
   * `scrollTop` assignment at all.
   */
  readonly onScrollSync?: (() => void) | undefined;
}

export interface ActiveDescendantResult {
  readonly listProps: {
    readonly role: 'listbox';
    readonly tabIndex: 0;
    readonly 'aria-activedescendant': string | undefined;
    readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  };
  /** Stable DOM id for a row, so `aria-activedescendant` can reference it. */
  readonly optionId: (index: number) => string;
}

/**
 * Keyboard navigation for a **virtualized** selectable list (S4-27).
 *
 * Uses `aria-activedescendant` rather than a roving `tabIndex`. A roving tabindex holds DOM focus on
 * a row element, and in a virtualized list that element unmounts as soon as it scrolls out of the
 * window — dropping focus to `<body>` mid-navigation. Here the container keeps focus permanently and
 * only an id reference moves, so unmounting a row is harmless.
 *
 * The hook is deliberately unaware of the rendered slice: it reasons over `count` and sets
 * `scrollTop` so the active index falls inside the window on the next frame. That is why it stays
 * correct even in the frame before the target row mounts — provided the consumer wires
 * `onScrollSync` (see {@link ActiveDescendantOptions.onScrollSync}) so the window recomputes
 * synchronously rather than waiting on a throttled scroll event.
 *
 * `DomPane`'s two-tab tablist keeps its roving tabindex — it is never virtualized, so the pattern
 * that is wrong here is right there.
 *
 * Type-ahead (jump-to-character) from the APG listbox pattern is intentionally omitted: rows here
 * are structured log/network entries, not a flat list of option labels, and single-character typing
 * is already claimed by the pane's filter input, not row navigation.
 */
export function useActiveDescendant({
  count,
  rowHeight,
  containerRef,
  idPrefix,
  activeIndex,
  onActiveIndexChange,
  onScrollSync,
}: ActiveDescendantOptions): ActiveDescendantResult {
  const optionId = useCallback((index: number) => `${idPrefix}-${index}`, [idPrefix]);

  const moveTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(count - 1, index));
      onActiveIndexChange(clamped);

      // Bring the row into view so the virtual window renders it and the id resolves.
      const el = containerRef.current;
      if (!el) {
        return;
      }
      const top = clamped * rowHeight;
      const viewport = el.clientHeight;
      if (top < el.scrollTop) {
        el.scrollTop = top;
      } else if (viewport > 0 && top + rowHeight > el.scrollTop + viewport) {
        el.scrollTop = top + rowHeight - viewport;
      } else if (viewport === 0) {
        // No layout yet (jsdom, or before first paint): anchoring at the row is still correct.
        el.scrollTop = top;
      }

      // `scrollTop` alone does not repaint the virtual window — see `onScrollSync`'s doc comment.
      // Force a synchronous recompute so the row this call just scrolled to is actually in the DOM
      // by the time `aria-activedescendant` names it.
      onScrollSync?.();
    },
    [count, rowHeight, containerRef, onActiveIndexChange, onScrollSync],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // `rowHeight <= 0` is as degenerate as `count === 0`: `computeWindow` treats both the same
      // way (an empty, unrenderable window), so this guard keeps the two in agreement and avoids a
      // `viewport / rowHeight` blow-up below.
      if (count === 0 || rowHeight <= 0) {
        return;
      }
      const viewport = containerRef.current?.clientHeight ?? 0;
      const page =
        viewport > 0 ? Math.max(1, Math.floor(viewport / rowHeight)) : FALLBACK_PAGE_ROWS;

      switch (event.key) {
        case 'ArrowDown':
          moveTo(activeIndex + 1);
          break;
        case 'ArrowUp':
          moveTo(activeIndex - 1);
          break;
        case 'PageDown':
          moveTo(activeIndex + page);
          break;
        case 'PageUp':
          moveTo(activeIndex - page);
          break;
        case 'Home':
          moveTo(0);
          break;
        case 'End':
          moveTo(count - 1);
          break;
        default:
          // Everything else — typing, shortcuts, Tab out of the list — is left alone.
          return;
      }
      event.preventDefault();
    },
    [count, rowHeight, containerRef, activeIndex, moveTo],
  );

  return {
    listProps: {
      role: 'listbox',
      tabIndex: 0,
      // An id pointing at nothing is worse than no id at all — omit it both when the list is
      // empty and when the consumer signals "nothing active" via a negative index.
      'aria-activedescendant': count > 0 && activeIndex >= 0 ? optionId(activeIndex) : undefined,
      onKeyDown,
    },
    optionId,
  };
}
