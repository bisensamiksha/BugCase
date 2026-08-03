// @vitest-environment jsdom
import type { NetworkEntry, NetworkLog } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkPane } from './panes/NetworkPane';
import type { NetworkFilterState } from './router/hash-state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (over: Partial<NetworkEntry> = {}): NetworkEntry => ({
  id: 'n1',
  url: 'https://example.com/api',
  method: 'GET',
  status: 200,
  statusText: 'OK',
  initiator: 'fetch',
  startedAt: '2026-06-27T12:00:00.000Z',
  endedAt: '2026-06-27T12:00:00.120Z',
  durationMs: 120,
  requestHeaders: [],
  responseHeaders: [],
  request: null,
  response: null,
  fromCache: false,
  failed: false,
  errorText: null,
  ...over,
});

const logOf = (entries: NetworkEntry[]): NetworkLog => ({
  schemaVersion: 'v1',
  capturedFromRingBuffer: true,
  capturedFromDebugger: false,
  entries,
});

const log = logOf([
  entry({ id: 'ok', url: 'https://example.com/api/ok', method: 'GET', status: 200 }),
  entry({ id: 'bad', url: 'https://example.com/api/bad', method: 'POST', status: 500 }),
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

const text = () => container.textContent ?? '';
const rows = () => container.querySelectorAll('[data-testid="network-row"]');

describe('NetworkPane hash state (S4-26)', () => {
  it('seeds its method filter from the route', () => {
    act(() => {
      root.render(<NetworkPane log={log} initialFilters={{ methods: new Set(['POST']) }} />);
    });

    expect(text()).toContain('/api/bad');
    expect(text()).not.toContain('/api/ok');
  });

  it('seeds its search query from the route', () => {
    act(() => {
      root.render(<NetworkPane log={log} initialFilters={{ query: '/api/ok' }} />);
    });

    expect(container.querySelector<HTMLInputElement>('[data-testid="network-search"]')?.value).toBe(
      '/api/ok',
    );
  });

  it('drops a seeded value this report does not contain instead of emptying the table', () => {
    // The link came from a capture that had PATCH requests; this one does not.
    act(() => {
      root.render(<NetworkPane log={log} initialFilters={{ methods: new Set(['PATCH']) }} />);
    });

    expect(rows().length).toBeGreaterThan(0);
  });

  it('reports the full filter state when the user changes a filter', () => {
    const onFiltersChange = vi.fn<(state: NetworkFilterState) => void>();

    act(() => {
      root.render(<NetworkPane log={log} onFiltersChange={onFiltersChange} />);
    });
    onFiltersChange.mockClear();

    const input = container.querySelector<HTMLInputElement>('[data-testid="network-search"]');
    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
      const setNativeValue = descriptor?.set;
      setNativeValue?.call(input, 'bad');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onFiltersChange).toHaveBeenCalled();
    expect(onFiltersChange.mock.calls.at(-1)?.[0].query).toBe('bad');
  });

  it('renders unfiltered when given no initial filters', () => {
    act(() => {
      root.render(<NetworkPane log={log} />);
    });

    expect(text()).toContain('/api/ok');
    expect(text()).toContain('/api/bad');
  });
});
