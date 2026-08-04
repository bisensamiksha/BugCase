// @vitest-environment jsdom
import type { ConsoleEntry, ConsoleLog } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConsolePane } from './panes/ConsolePane';
import type { ConsoleFilterState } from './router/hash-state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (over: Partial<ConsoleEntry> = {}): ConsoleEntry => ({
  id: 'e1',
  timestamp: '2026-06-27T12:00:00.000Z',
  level: 'log',
  args: [{ type: 'string', preview: 'hello' }],
  ...over,
});

const logOf = (entries: ConsoleEntry[]): ConsoleLog => ({
  schemaVersion: 'v1',
  capturedFromRingBuffer: true,
  capturedFromDebugger: false,
  bufferSize: 100,
  truncated: false,
  entries,
});

/** `n` distinct entries, for tests that care about count/virtualization rather than content. */
const logWith = (n: number): ConsoleLog =>
  logOf(
    Array.from({ length: n }, (_, i) =>
      entry({ id: `e${i}`, args: [{ type: 'string', preview: `entry ${i}` }] }),
    ),
  );

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
// React's value tracker swallows a plain `.value` assignment; set through the native prototype
// setter so React registers the change, then dispatch `input` (mirrors JsonTreeViewer.test.tsx).
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
    const setNativeValue = descriptor?.set;
    setNativeValue?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

function render(log: ConsoleLog | null, initialFilters?: Partial<ConsoleFilterState>) {
  act(() => {
    root.render(
      initialFilters === undefined ? (
        <ConsolePane log={log} />
      ) : (
        <ConsolePane log={log} initialFilters={initialFilters} />
      ),
    );
  });
}

/**
 * Flushes exactly one real `requestAnimationFrame` tick, wrapped in `act` so the React state
 * update `useVirtualWindow`'s `onScroll` schedules inside that callback is committed before the
 * assertions run. jsdom's `requestAnimationFrame` queue is FIFO, so a callback registered here
 * (after the row-jump keydown that registers the hook's own raf callback via `onScrollSync`)
 * always resolves after it.
 */
const flushRaf = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  );

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ConsolePane', () => {
  it('renders one row per entry', () => {
    render(
      logOf([
        entry({ id: 'a', args: [{ type: 'string', preview: 'alpha' }] }),
        entry({ id: 'b', level: 'error', args: [{ type: 'string', preview: 'beta' }] }),
      ]),
    );
    expect(qa('console-row')).toHaveLength(2);
    expect(container.textContent).toContain('alpha');
    expect(container.textContent).toContain('beta');
  });

  it('shows the empty state for a null log', () => {
    render(null);
    expect(q('console-empty')).not.toBeNull();
    expect(qa('console-row')).toHaveLength(0);
  });

  it('hides a level when its chip is toggled off', () => {
    render(
      logOf([
        entry({ id: 'a', level: 'log' }),
        entry({ id: 'b', level: 'error', args: [{ type: 'string', preview: 'boom' }] }),
      ]),
    );
    expect(qa('console-row')).toHaveLength(2);
    click(q('console-level-log')!);
    expect(qa('console-row')).toHaveLength(1);
    expect(container.textContent).toContain('boom');
  });

  it('filters by full-text search', () => {
    render(
      logOf([
        entry({ id: 'a', args: [{ type: 'string', preview: 'alpha' }] }),
        entry({ id: 'b', args: [{ type: 'string', preview: 'beta' }] }),
      ]),
    );
    typeInto(q('console-search') as HTMLInputElement, 'alpha');
    expect(qa('console-row')).toHaveLength(1);
    expect(container.textContent).toContain('alpha');
  });

  it('flags an invalid regex and shows no matches without throwing', () => {
    render(logOf([entry({ id: 'a', args: [{ type: 'string', preview: 'alpha' }] })]));
    click(q('console-regex')!);
    typeInto(q('console-search') as HTMLInputElement, '(');
    expect(q('console-invalid-regex')).not.toBeNull();
    expect(q('console-no-matches')).not.toBeNull();
    expect(qa('console-row')).toHaveLength(0);
  });

  it('applies the time cutoff and restores on reset', () => {
    render(
      logOf([
        entry({
          id: 'a',
          timestamp: '2026-06-27T12:00:00.000Z',
          args: [{ type: 'string', preview: 'early' }],
        }),
        entry({
          id: 'b',
          timestamp: '2026-06-27T12:00:10.000Z',
          args: [{ type: 'string', preview: 'late' }],
        }),
      ]),
    );
    typeInto(q('console-time') as HTMLInputElement, String(Date.parse('2026-06-27T12:00:05.000Z')));
    expect(qa('console-row')).toHaveLength(1);
    expect(container.textContent).toContain('early');
    click(q('console-time-reset')!);
    expect(qa('console-row')).toHaveLength(2);
  });

  it('shows a detail panel with an expandable JsonTree for an object arg', () => {
    render(
      logOf([
        entry({
          id: 'a',
          level: 'error',
          args: [
            { type: 'string', preview: 'ctx:' },
            { type: 'object', preview: 'Object', full: { code: 500, ok: false } },
          ],
          stack: 'Error: boom\n  at x',
          source: { file: 'app.js', line: 42, column: 8 },
        }),
      ]),
    );
    click(q('console-row')!);
    const detail = q('console-detail')!;
    expect(detail.textContent).toContain('app.js');
    // The object arg renders through JsonTree (native <details> summary "Object(2)").
    expect(detail.querySelector('details')).not.toBeNull();
    expect(detail.textContent).toContain('code');
    expect(q('console-stack')).not.toBeNull();
  });

  it('shows a no-matches note when filters exclude everything', () => {
    render(logOf([entry({ id: 'a', level: 'log' })]));
    click(q('console-level-log')!);
    expect(q('console-no-matches')).not.toBeNull();
    expect(qa('console-row')).toHaveLength(0);
  });

  it('has no axe violations', async () => {
    render(
      logOf([
        entry({ id: 'a', level: 'log', args: [{ type: 'string', preview: 'alpha' }] }),
        entry({ id: 'b', level: 'error', args: [{ type: 'string', preview: 'beta' }] }),
      ]),
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations when the filters exclude every entry (S4-27)', async () => {
    // role="listbox" requires role="option" owned children; the empty state's "no matches"
    // paragraph must not end up as a non-option child of the listbox (aria-required-children).
    render(logOf([entry({ id: 'a', level: 'log' })]));
    click(q('console-level-log')!);
    expect(q('console-no-matches')).not.toBeNull();

    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('exposes the entry list as a single-tab-stop listbox (S4-27)', () => {
    render(logWith(5));

    const list = q('console-list')!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('aria-label')).toBe('Console entries');
    expect(list.tabIndex).toBe(0);
  });

  it('marks rows as options rather than individual tab stops (S4-27)', () => {
    render(logWith(5));

    const rows = qa('console-row');
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(row.getAttribute('role')).toBe('option');
      expect(row.hasAttribute('aria-selected')).toBe(true);
      expect(row.tabIndex).toBe(-1);
    }
  });

  it('starts with no active descendant when nothing is selected (S4-27)', () => {
    render(logWith(5));

    const list = q('console-list')!;
    expect(list.getAttribute('aria-activedescendant')).toBeNull();
    // The disagreement finding-1 caught: nothing should read as selected either.
    for (const row of qa('console-row')) {
      expect(row.getAttribute('aria-selected')).toBe('false');
    }
  });

  it('the first ArrowDown selects row 0 specifically, not row 1 (S4-27)', () => {
    render(logWith(5));
    const list = q('console-list')!;

    act(() => {
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(list.getAttribute('aria-activedescendant')).toBe('console-option-0');
    expect(document.getElementById('console-option-0')?.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps arrows inert when the filters match nothing (S4-27)', () => {
    render(logWith(5), { query: 'zzz-no-such-entry' });

    const list = q('console-list')!;
    expect(list.getAttribute('aria-activedescendant')).toBeNull();
    expect(() =>
      act(() => {
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      }),
    ).not.toThrow();
  });

  it('renders the row End jumped to even though it starts outside the initial virtual window (S4-27 onScrollSync)', async () => {
    // 60 rows so the last one sits well past the ~5-row window jsdom's zero clientHeight renders
    // by default. Only a synchronously-wired onScrollSync brings it into the DOM.
    render(logWith(60));
    const list = q('console-list')!;

    act(() => {
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    await flushRaf();

    const active = list.getAttribute('aria-activedescendant');
    expect(active).not.toBeNull();
    const activeRow = document.getElementById(active!);
    expect(activeRow).not.toBeNull();
    expect(activeRow?.getAttribute('role')).toBe('option');
    expect(activeRow?.getAttribute('aria-selected')).toBe('true');
  });

  it('drops aria-activedescendant when a filter removes the selected entry, even though other rows remain (S4-27 clamping)', () => {
    render(
      logOf([
        entry({ id: 'a', args: [{ type: 'string', preview: 'keep-a' }] }),
        entry({ id: 'b', args: [{ type: 'string', preview: 'keep-b' }] }),
        entry({ id: 'c', args: [{ type: 'string', preview: 'keep-c' }] }),
        entry({ id: 'd', args: [{ type: 'string', preview: 'keep-d' }] }),
        entry({ id: 'e', args: [{ type: 'string', preview: 'drop-e' }] }),
      ]),
    );

    // Select the last row (id "e") before a filter removes it from the visible list.
    click(qa('console-row')[4]!);
    expect(q('console-detail')?.textContent).toContain('drop-e');

    typeInto(q('console-search') as HTMLInputElement, 'keep');
    expect(qa('console-row')).toHaveLength(4);

    // "e" is gone but a, b, c, d remain — the reference must go absent, not silently repoint at
    // row 0 (that mismatch, with row 0 showing aria-selected="false", is finding 1 from review).
    const list = q('console-list')!;
    expect(list.getAttribute('aria-activedescendant')).toBeNull();
    for (const row of qa('console-row')) {
      expect(row.getAttribute('aria-selected')).toBe('false');
    }
  });

  it('drops aria-activedescendant when a filter removes every entry, including the selected one (S4-27 clamping)', () => {
    render(logOf([entry({ id: 'a', level: 'log' })]));

    click(q('console-row')!);
    expect(q('console-detail')?.textContent).not.toContain('Select an entry');

    click(q('console-level-log')!);
    expect(qa('console-row')).toHaveLength(0);

    const list = q('console-list')!;
    expect(list.getAttribute('aria-activedescendant')).toBeNull();
  });
});
