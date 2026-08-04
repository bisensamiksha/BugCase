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
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
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
 * correct even in the frame before the target row mounts.
 *
 * `DomPane`'s two-tab tablist keeps its roving tabindex — it is never virtualized, so the pattern
 * that is wrong here is right there.
 */
export function useActiveDescendant({
  count,
  rowHeight,
  containerRef,
  idPrefix,
  activeIndex,
  onActiveIndexChange,
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
    },
    [count, rowHeight, containerRef, onActiveIndexChange],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (count === 0) {
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
      // An id pointing at nothing is worse than no id at all.
      'aria-activedescendant': count > 0 ? optionId(activeIndex) : undefined,
      onKeyDown,
    },
    optionId,
  };
}
