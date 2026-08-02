// @vitest-environment jsdom
import type { ConsoleEntry, ConsoleLog } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const log = logOf([
  entry({ id: 'a', level: 'error', args: [{ type: 'string', preview: 'boom timeout' }] }),
  entry({ id: 'b', level: 'log', args: [{ type: 'string', preview: 'ordinary' }] }),
  entry({ id: 'c', level: 'warn', args: [{ type: 'string', preview: 'careful' }] }),
]);

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const rowText = () => container.textContent ?? '';
const search = () => container.querySelector<HTMLInputElement>('[data-testid="console-search"]');

// React's value tracker swallows a plain `.value` assignment; set through the native prototype
// setter so React registers the change (mirrors console-pane.test.tsx).
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
    const setNativeValue = descriptor?.set;
    setNativeValue?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('ConsolePane hash state (S4-26)', () => {
  it('seeds its level filter from the route', () => {
    act(() => {
      root.render(<ConsolePane log={log} initialFilters={{ levels: new Set(['error']) }} />);
    });

    expect(rowText()).toContain('boom timeout');
    expect(rowText()).not.toContain('ordinary');
  });

  it('seeds its search query from the route', () => {
    act(() => {
      root.render(<ConsolePane log={log} initialFilters={{ query: 'timeout' }} />);
    });

    expect(search()?.value).toBe('timeout');
    expect(rowText()).toContain('boom timeout');
    expect(rowText()).not.toContain('ordinary');
  });

  it('reports the full filter state when the user changes a filter', () => {
    const onFiltersChange = vi.fn<(state: ConsoleFilterState) => void>();

    act(() => {
      root.render(<ConsolePane log={log} onFiltersChange={onFiltersChange} />);
    });
    onFiltersChange.mockClear();

    typeInto(search() as HTMLInputElement, 'careful');

    expect(onFiltersChange).toHaveBeenCalled();
    const last = onFiltersChange.mock.calls.at(-1)?.[0];
    expect(last?.query).toBe('careful');
  });

  it('renders unfiltered when given no initial filters', () => {
    act(() => {
      root.render(<ConsolePane log={log} />);
    });

    expect(rowText()).toContain('boom timeout');
    expect(rowText()).toContain('ordinary');
    expect(rowText()).toContain('careful');
  });

  it('ignores a seeded level that no longer exists rather than emptying the pane', () => {
    act(() => {
      // A link from a build with a level this one does not know.
      root.render(
        <ConsolePane log={log} initialFilters={{ levels: new Set([]) }} />,
      );
    });

    expect(rowText()).toContain('boom timeout');
  });
});
