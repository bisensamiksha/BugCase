// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeWindow } from '../lib/virtual-window';

import { useActiveDescendant } from './use-active-descendant';

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

function List({
  count,
  rowHeight = ROW_H,
  onScrollSync,
}: {
  count: number;
  rowHeight?: number;
  onScrollSync?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { listProps, optionId } = useActiveDescendant({
    count,
    rowHeight,
    containerRef: ref,
    idPrefix: 'row',
    activeIndex,
    onActiveIndexChange: setActiveIndex,
    onScrollSync,
  });
  return (
    <div ref={ref} data-testid="list" {...listProps}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} id={optionId(i)} role="option" aria-selected={i === activeIndex} />
      ))}
    </div>
  );
}

const list = () => container.querySelector<HTMLElement>('[data-testid="list"]')!;

function press(key: string) {
  act(() => {
    list().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('useActiveDescendant', () => {
  it('exposes the container as a single tab stop with a listbox role', () => {
    act(() => root.render(<List count={10} />));

    expect(list().getAttribute('role')).toBe('listbox');
    expect(list().tabIndex).toBe(0);
  });

  it('points aria-activedescendant at the active row', () => {
    act(() => root.render(<List count={10} />));

    expect(list().getAttribute('aria-activedescendant')).toBe('row-0');
  });

  it('moves down on ArrowDown and up on ArrowUp', () => {
    act(() => root.render(<List count={10} />));

    press('ArrowDown');
    expect(list().getAttribute('aria-activedescendant')).toBe('row-1');

    press('ArrowUp');
    expect(list().getAttribute('aria-activedescendant')).toBe('row-0');
  });

  it('clamps at both ends rather than wrapping', () => {
    act(() => root.render(<List count={3} />));

    press('ArrowUp');
    expect(list().getAttribute('aria-activedescendant')).toBe('row-0');

    press('End');
    press('ArrowDown');
    expect(list().getAttribute('aria-activedescendant')).toBe('row-2');
  });

  it('jumps to the first and last rows on Home and End', () => {
    act(() => root.render(<List count={50} />));

    press('End');
    expect(list().getAttribute('aria-activedescendant')).toBe('row-49');

    press('Home');
    expect(list().getAttribute('aria-activedescendant')).toBe('row-0');
  });

  it('moves a viewport at a time on PageDown and PageUp', () => {
    act(() => root.render(<List count={100} />));
    // jsdom reports clientHeight 0, so the hook must fall back to a fixed page size (10 rows) rather
    // than divide by zero. With activeIndex starting at 0, PageDown must land exactly on row 10.
    press('PageDown');
    expect(list().getAttribute('aria-activedescendant')).toBe('row-10');

    press('PageUp');
    expect(list().getAttribute('aria-activedescendant')).toBe('row-0');
  });

  it('scrolls the container so the active row stays inside the virtual window', () => {
    act(() => root.render(<List count={100} />));
    Object.defineProperty(list(), 'clientHeight', { value: 100, configurable: true });

    press('End');

    // Row 99 sits at 1980px (99 * 20). Its bottom edge (2000px) must land flush with the viewport
    // bottom: scrollTop = 1980 + 20 - 100 = 1900. Not just "> 0" — the exact value.
    expect(list().scrollTop).toBe(1900);

    // Prove the hook's actual promise, not just the arithmetic: with that scrollTop, the virtual
    // window computed the same way the panes compute it actually contains row 99.
    const window = computeWindow({
      scrollTop: list().scrollTop,
      viewportH: 100,
      rowH: ROW_H,
      count: 100,
    });
    expect(window.startIndex).toBeLessThanOrEqual(99);
    expect(window.endIndex).toBeGreaterThanOrEqual(99);
  });

  it('scrolls upward when the active row moves above the rendered window', () => {
    act(() => root.render(<List count={100} />));
    Object.defineProperty(list(), 'clientHeight', { value: 100, configurable: true });

    press('End'); // activeIndex -> 99, scrollTop -> 1900 (see test above)
    press('PageUp'); // viewport 100 / rowHeight 20 -> page 5; activeIndex -> 94, top 1880 < scrollTop 1900

    expect(list().getAttribute('aria-activedescendant')).toBe('row-94');
    // The upward branch anchors scrollTop directly at the row's top, not at some viewport-relative
    // offset: 94 * 20 = 1880.
    expect(list().scrollTop).toBe(1880);

    const window = computeWindow({
      scrollTop: list().scrollTop,
      viewportH: 100,
      rowH: ROW_H,
      count: 100,
    });
    expect(window.startIndex).toBeLessThanOrEqual(94);
    expect(window.endIndex).toBeGreaterThanOrEqual(94);
  });

  it('calls onScrollSync synchronously after moving, so the virtual window can recompute in the same tick', () => {
    const onScrollSync = vi.fn();
    act(() => root.render(<List count={10} onScrollSync={onScrollSync} />));

    press('ArrowDown');

    expect(onScrollSync).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onScrollSync is omitted', () => {
    act(() => root.render(<List count={10} />));

    expect(() => press('ArrowDown')).not.toThrow();
  });

  it('ignores key presses when rowHeight is non-positive, mirroring the empty-list guard', () => {
    act(() => root.render(<List count={10} rowHeight={0} />));
    // A positive, measured viewport with rowHeight 0 is exactly the shape that would otherwise
    // divide by zero computing the Page-key step (viewport / rowHeight).
    Object.defineProperty(list(), 'clientHeight', { value: 100, configurable: true });

    expect(() => press('PageDown')).not.toThrow();
    expect(list().getAttribute('aria-activedescendant')).toBe('row-0');
  });

  it('emits no aria-activedescendant for an empty list and ignores arrows', () => {
    act(() => root.render(<List count={0} />));

    expect(list().getAttribute('aria-activedescendant')).toBeNull();
    expect(() => press('ArrowDown')).not.toThrow();
  });

  it('leaves other keys alone so typing still reaches the page', () => {
    act(() => root.render(<List count={10} />));

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    act(() => {
      list().dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });
});
