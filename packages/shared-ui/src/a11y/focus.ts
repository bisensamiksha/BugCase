import { useEffect, useRef, type RefObject } from 'react';

/**
 * Focus primitives shared by every surface that opens a modal (S4-27).
 *
 * These live in `shared-ui` rather than the dashboard because `Lightbox` is here and the dependency
 * only runs one way: the dashboard may import shared-ui, never the reverse. The dashboard re-exports
 * them from `src/a11y/focus.ts` so its own code has a single import site.
 */

/** Selector for things a user can Tab to. `[hidden]` subtrees and disabled controls are excluded below. */
const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/**
 * Interactive descendants of `root`, in DOM (tab) order.
 *
 * jsdom has no layout, so visibility cannot be tested via `offsetParent` the way it would be in a
 * browser. `[hidden]` and `disabled` are the two exclusions that are meaningful in both environments,
 * which keeps the unit tests honest about what they actually prove.
 */
export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('tabindex') !== '-1' &&
      el.closest('[hidden]') === null,
  );
}

/**
 * Keep Tab inside `ref` while it is mounted, and route Escape to `onEscape`.
 *
 * A dialog that lets Tab walk into the page behind it is worse than no dialog: a screen-reader user
 * ends up reading content they cannot see. With zero focusable children the trap is a no-op rather
 * than an infinite loop.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement>,
  options: { onEscape?: (() => void) | undefined } = {},
): void {
  // Keep the latest callback without re-binding the listener every render.
  const onEscapeRef = useRef(options.onEscape);
  onEscapeRef.current = options.onEscape;

  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = getFocusable(container!);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [ref]);
}

/**
 * Return focus to whatever was focused before `isOpen` became true.
 *
 * Without this, closing a lightbox drops focus to `<body>` and a keyboard user restarts from the top
 * of the page. If the opener has since been removed from the document, focus is left alone rather
 * than thrown somewhere arbitrary.
 */
export function useFocusRestore(isOpen: boolean): void {
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    openerRef.current = document.activeElement as HTMLElement | null;

    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener.isConnected) {
        opener.focus();
      }
    };
  }, [isOpen]);
}
