// @vitest-environment jsdom
import type { ConsoleEntry, ConsoleLog } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConsolePane } from './panes/ConsolePane';

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

function render(log: ConsoleLog | null) {
  act(() => {
    root.render(<ConsolePane log={log} />);
  });
}

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
});
