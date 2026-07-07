/**
 * Devtools-style element picker (S3-13).
 *
 * Runs where the DOM lives (the overlay's isolated world). While active it draws a highlight box over
 * the element under the cursor and, on click, hands that element to `onPick` (staying active so several
 * elements can be inspected in one session). Escape cancels. It ignores BugCase's own UI, uses a
 * `pointer-events: none` highlight so it never intercepts the target, and restores the page (listeners +
 * highlight) on `stop()`.
 */

import { OVERLAY_HOST_ID } from '../shared/overlay-host';

/** Id of the picker's highlight box, so it can be ignored + removed. */
export const PICKER_HIGHLIGHT_ID = 'bugcase-picker-highlight';

export interface ElementPickerOptions {
  readonly onPick: (el: Element) => void;
  readonly onCancel?: () => void;
  /** Whether an element belongs to BugCase's own UI (ignored). Defaults to an overlay-host check. */
  readonly isOwnUi?: (el: Element | null) => boolean;
}

export interface ElementPickerHandle {
  readonly stop: () => void;
}

function defaultIsOwnUi(el: Element | null): boolean {
  if (!el) {
    return false;
  }
  if (el.id === PICKER_HIGHLIGHT_ID) {
    return true;
  }
  return typeof el.closest === 'function' && el.closest(`#${OVERLAY_HOST_ID}`) !== null;
}

export function installElementPicker(
  doc: Document,
  options: ElementPickerOptions,
): ElementPickerHandle {
  const isOwnUi = options.isOwnUi ?? defaultIsOwnUi;
  let stopped = false;

  const highlight = doc.createElement('div');
  highlight.id = PICKER_HIGHLIGHT_ID;
  highlight.setAttribute('aria-hidden', 'true');
  Object.assign(highlight.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    display: 'none',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    zIndex: '2147483646',
    border: '2px solid #2563eb',
    background: 'rgba(37, 99, 235, 0.15)',
  } satisfies Partial<CSSStyleDeclaration>);
  (doc.body ?? doc.documentElement).appendChild(highlight);

  function targetOf(event: Event): Element | null {
    return event.target instanceof Element ? event.target : null;
  }

  function positionOver(el: Element): void {
    try {
      const rect = el.getBoundingClientRect();
      Object.assign(highlight.style, {
        display: 'block',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      } satisfies Partial<CSSStyleDeclaration>);
    } catch {
      highlight.style.display = 'none';
    }
  }

  const onMove = (event: Event): void => {
    const el = targetOf(event);
    if (!el || isOwnUi(el)) {
      highlight.style.display = 'none';
      return;
    }
    positionOver(el);
  };

  const onClick = (event: Event): void => {
    const el = targetOf(event);
    if (!el || isOwnUi(el)) {
      return;
    }
    // Swallow the click so picking an element never activates the page.
    event.preventDefault();
    event.stopPropagation();
    try {
      options.onPick(el);
    } catch {
      // A consumer failure must not break the page's own event handling.
    }
  };

  const onKeydown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape') {
      event.preventDefault();
      options.onCancel?.();
    }
  };

  doc.addEventListener('mousemove', onMove, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeydown, true);

  return {
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      doc.removeEventListener('mousemove', onMove, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('keydown', onKeydown, true);
      highlight.remove();
    },
  };
}
