// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useVirtualWindow } from './virtual-window';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW_H = 20;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * Minimal stand-in for ConsolePane/NetworkPane's list container: `hidden` (Tailwind's
 * `display: none`) is applied exactly the way both panes apply it — whenever `count === 0`.
 */
function List({ count }: { readonly count: number }) {
  const { window: vwin, containerRef, onScroll } = useVirtualWindow(count, ROW_H);
  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      data-testid="list"
      className={count === 0 ? 'hidden' : ''}
    >
      {Array.from({ length: Math.max(0, vwin.endIndex - vwin.startIndex + 1) }, (_, i) => (
        <div key={i} data-testid="row" style={{ height: ROW_H }} />
      ))}
    </div>
  );
}

const list = () => container.querySelector<HTMLElement>('[data-testid="list"]')!;
const rows = () => container.querySelectorAll('[data-testid="row"]');

/**
 * jsdom never computes layout, so `clientHeight` is always 0 regardless of `display` — it has no
 * layout engine to derive it from. Stub it to mirror what a real browser reports: 0 while `hidden`
 * is applied, a real viewport height once it is not. This is the same idiom
 * `use-active-descendant.test.tsx` uses for a fixed `clientHeight`, adapted here to react to the
 * container's own `hidden` class the way a real browser's `display: none` would.
 */
function stubClientHeight(el: HTMLElement, visibleHeight: number): void {
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get() {
      return el.classList.contains('hidden') ? 0 : visibleHeight;
    },
  });
}

describe('useVirtualWindow — re-measuring after mounting hidden (S4-27 residual 2)', () => {
  it('renders every row once a pane that mounted with count 0 gains rows, not just the overscan window', () => {
    const N = 20;
    act(() => root.render(<List count={0} />));
    expect(rows()).toHaveLength(0);

    // Stub only after the empty mount — the mount-time measurement should see jsdom's ordinary
    // (unstubbed) 0, same as it would with no stub at all; only what happens *after* rows appear is
    // under test here.
    stubClientHeight(list(), 600); // plenty of room for all 20 rows at rowH 20

    act(() => root.render(<List count={N} />));

    // Without the fix, `viewportH` is captured once at mount (0, because the container was
    // `hidden` then) and never recomputed: only the ~4-row overscan renders regardless of the real
    // container height. With the fix, the measuring effect re-runs because `count` changed, sees
    // the container is no longer `hidden`, and the full list fits inside the (stubbed) 600px
    // viewport.
    expect(rows()).toHaveLength(N);
  });

  it('still renders only the overscan window immediately after mounting empty (sanity: no change to the mount-time read)', () => {
    act(() => root.render(<List count={0} />));
    stubClientHeight(list(), 600);

    // Re-rendering with the SAME count (still 0) must not spuriously "recover" a viewport — there
    // are no rows to render either way, but this pins down that the effect's dependency is `count`
    // changing, not some other unrelated re-render.
    act(() => root.render(<List count={0} />));

    expect(rows()).toHaveLength(0);
  });
});
