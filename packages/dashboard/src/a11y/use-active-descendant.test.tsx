// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

function List({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { listProps, optionId } = useActiveDescendant({
    count,
    rowHeight: ROW_H,
    containerRef: ref,
    idPrefix: 'row',
    activeIndex,
    onActiveIndexChange: setActiveIndex,
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
    // jsdom reports clientHeight 0; the hook must fall back to a fixed page size, not divide by zero.
    press('PageDown');

    const after = list().getAttribute('aria-activedescendant')!;
    expect(Number(after.replace('row-', ''))).toBeGreaterThan(0);
  });

  it('scrolls the container so the active row stays inside the virtual window', () => {
    act(() => root.render(<List count={100} />));
    Object.defineProperty(list(), 'clientHeight', { value: 100, configurable: true });

    press('End');

    // Row 99 sits at 1980px; the container must have scrolled to bring it into view.
    expect(list().scrollTop).toBeGreaterThan(0);
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
