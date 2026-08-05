// @vitest-environment jsdom
import type { NetworkEntry, NetworkLog } from '@bugcase/schema';
import axe from 'axe-core';
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

/** `n` distinct entries, for tests that care about count/virtualization rather than content. */
const logWith = (n: number): NetworkLog =>
  logOf(
    Array.from({ length: n }, (_, i) =>
      entry({ id: `n${i}`, url: `https://example.com/api/${i}` }),
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
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- plain value setter, invoked via .call below
    const setNativeValue = descriptor?.set;
    setNativeValue?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

function render(log: NetworkLog | null, initialFilters?: Partial<NetworkFilterState>) {
  act(() => {
    root.render(
      initialFilters === undefined ? (
        <NetworkPane log={log} />
      ) : (
        <NetworkPane log={log} initialFilters={initialFilters} />
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

describe('NetworkPane', () => {
  it('renders one row per entry with method, url and status', () => {
    render(
      logOf([
        entry({ id: 'a', method: 'GET', status: 200, url: 'https://example.com/ok' }),
        entry({ id: 'b', method: 'POST', status: 404, url: 'https://example.com/missing' }),
      ]),
    );
    expect(qa('network-row')).toHaveLength(2);
    expect(container.textContent).toContain('GET');
    expect(container.textContent).toContain('https://example.com/ok');
    expect(container.textContent).toContain('200');
    expect(container.textContent).toContain('404');
  });

  it('shows the empty state for a null log', () => {
    render(null);
    expect(q('network-empty')).not.toBeNull();
    expect(qa('network-row')).toHaveLength(0);
  });

  it('renders a failed/null-status entry with a placeholder, without literal "null"', () => {
    render(
      logOf([
        entry({
          id: 'a',
          method: 'POST',
          status: null,
          statusText: null,
          durationMs: null,
          endedAt: null,
          failed: true,
          errorText: 'net::ERR_FAILED',
        }),
      ]),
    );
    const row = qa('network-row')[0]!;
    expect(row.textContent).toContain('POST');
    expect(row.textContent).not.toContain('null');
    expect(row.textContent).toContain('failed');
  });

  it('hides a status class when its chip is toggled off', () => {
    render(
      logOf([
        entry({ id: 'a', status: 200, url: 'https://x/ok' }),
        entry({ id: 'b', status: 500, url: 'https://x/boom' }),
      ]),
    );
    expect(qa('network-row')).toHaveLength(2);
    click(q('network-status-2xx')!);
    expect(qa('network-row')).toHaveLength(1);
    expect(container.textContent).toContain('https://x/boom');
  });

  it('hides a method when its chip is toggled off', () => {
    render(
      logOf([
        entry({ id: 'a', method: 'GET', url: 'https://x/get' }),
        entry({ id: 'b', method: 'POST', url: 'https://x/post' }),
      ]),
    );
    click(q('network-method-GET')!);
    expect(qa('network-row')).toHaveLength(1);
    expect(container.textContent).toContain('https://x/post');
  });

  it('hides an initiator when its chip is toggled off', () => {
    render(
      logOf([
        entry({ id: 'a', initiator: 'fetch', url: 'https://x/fetch' }),
        entry({ id: 'b', initiator: 'xhr', url: 'https://x/xhr' }),
      ]),
    );
    click(q('network-initiator-fetch')!);
    expect(qa('network-row')).toHaveLength(1);
    expect(container.textContent).toContain('https://x/xhr');
  });

  it('filters by full-text search', () => {
    render(
      logOf([
        entry({ id: 'a', url: 'https://x/alpha' }),
        entry({ id: 'b', url: 'https://x/beta' }),
      ]),
    );
    typeInto(q('network-search') as HTMLInputElement, 'alpha');
    expect(qa('network-row')).toHaveLength(1);
    expect(container.textContent).toContain('alpha');
  });

  it('flags an invalid regex and shows no matches without throwing', () => {
    render(logOf([entry({ id: 'a', url: 'https://x/alpha' })]));
    click(q('network-regex')!);
    typeInto(q('network-search') as HTMLInputElement, '(');
    expect(q('network-invalid-regex')).not.toBeNull();
    expect(q('network-no-matches')).not.toBeNull();
    expect(qa('network-row')).toHaveLength(0);
  });

  it('shows a detail panel with headers and a JSON body via JsonTree on select', () => {
    render(
      logOf([
        entry({
          id: 'a',
          method: 'POST',
          status: 500,
          statusText: 'Server Error',
          requestHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          responseHeaders: [{ name: 'X-Trace', value: 'abc123' }],
          response: {
            mimeType: 'application/json',
            sizeBytes: 12,
            text: '{"code":500}',
            truncated: false,
          },
        }),
      ]),
    );
    click(q('network-row')!);
    const detail = q('network-detail')!;
    expect(detail.textContent).toContain('Content-Type');
    expect(detail.textContent).toContain('X-Trace');
    // The JSON response body renders through JsonTree (native <details>).
    expect(detail.querySelector('details')).not.toBeNull();
    expect(detail.textContent).toContain('code');
  });

  it('copies the request as a cURL command to the clipboard', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(logOf([entry({ id: 'a', method: 'GET', url: 'https://x/ok' })]));
    click(q('network-row')!);
    click(q('network-curl')!);
    // Flush the post-clipboard setCopiedId microtask inside act so no update escapes it.
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("curl 'https://x/ok'");
  });

  it('shows a no-matches note when filters exclude everything', () => {
    render(logOf([entry({ id: 'a', status: 200 })]));
    click(q('network-status-2xx')!);
    expect(q('network-no-matches')).not.toBeNull();
    expect(qa('network-row')).toHaveLength(0);
  });

  it('has no axe violations', async () => {
    render(
      logOf([
        entry({ id: 'a', status: 200, url: 'https://x/ok' }),
        entry({ id: 'b', status: 500, url: 'https://x/boom', method: 'POST' }),
      ]),
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations when the filters exclude every entry (S4-27)', async () => {
    // role="listbox" requires role="option" owned children; the empty state's "no matches"
    // paragraph must not end up as a non-option child of the listbox (aria-required-children).
    render(logOf([entry({ id: 'a', status: 200 })]));
    click(q('network-status-2xx')!);
    expect(q('network-no-matches')).not.toBeNull();

    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('exposes the request list as a single-tab-stop listbox (S4-27)', () => {
    render(logWith(5));

    const list = q('network-list')!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('aria-label')).toBe('Network requests');
    expect(list.tabIndex).toBe(0);
  });

  it('marks rows as options rather than individual tab stops (S4-27)', () => {
    render(logWith(5));

    const rows = qa('network-row');
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(row.getAttribute('role')).toBe('option');
      expect(row.hasAttribute('aria-selected')).toBe(true);
      expect(row.tabIndex).toBe(-1);
    }
  });

  it("each row's accessible name contains the text it shows on screen (S4-27)", () => {
    render(logWith(5));

    const rows = qa('network-row');
    expect(rows.length).toBe(5);
    for (const row of rows) {
      // WCAG 2.5.3 Label in Name. This also pins the size column into the name: the label used to
      // list method/status/url/duration and skip size, so screen-reader users lost a column that
      // is on screen. Columns are spaced with CSS `gap-3`, hence the whitespace text nodes too.
      const visible = row.textContent.replace(/\s+/g, ' ').trim();
      const name = row.getAttribute('aria-label')!.replace(/\s+/g, ' ').trim();
      expect(visible).not.toBe('');
      expect(name).toContain(visible);
    }
  });

  it('starts with no active descendant when nothing is selected (S4-27)', () => {
    render(logWith(5));

    const list = q('network-list')!;
    expect(list.getAttribute('aria-activedescendant')).toBeNull();
    // Nothing should read as selected either — a stale row-0 default would disagree with this.
    for (const row of qa('network-row')) {
      expect(row.getAttribute('aria-selected')).toBe('false');
    }
  });

  it('the first ArrowDown selects row 0 specifically, not row 1 (S4-27)', () => {
    render(logWith(5));
    const list = q('network-list')!;

    act(() => {
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(list.getAttribute('aria-activedescendant')).toBe('network-option-0');
    expect(document.getElementById('network-option-0')?.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps arrows inert when the filters match nothing (S4-27)', () => {
    render(logWith(5), { query: 'zzz-no-such-request' });

    const list = q('network-list')!;
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
    const list = q('network-list')!;

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
        entry({ id: 'a', url: 'https://x/keep-a' }),
        entry({ id: 'b', url: 'https://x/keep-b' }),
        entry({ id: 'c', url: 'https://x/keep-c' }),
        entry({ id: 'd', url: 'https://x/keep-d' }),
        entry({ id: 'e', url: 'https://x/drop-e' }),
      ]),
    );

    // Select the last row (id "e") before a filter removes it from the visible list.
    click(qa('network-row')[4]!);
    expect(q('network-detail')?.textContent).toContain('drop-e');

    typeInto(q('network-search') as HTMLInputElement, 'keep');
    expect(qa('network-row')).toHaveLength(4);

    // "e" is gone but a, b, c, d remain — the reference must go absent, not silently repoint at
    // row 0.
    const list = q('network-list')!;
    expect(list.getAttribute('aria-activedescendant')).toBeNull();
    for (const row of qa('network-row')) {
      expect(row.getAttribute('aria-selected')).toBe('false');
    }
  });

  it('drops aria-activedescendant when a filter removes every entry, including the selected one (S4-27 clamping)', () => {
    render(logOf([entry({ id: 'a', status: 200 })]));

    click(q('network-row')!);
    expect(q('network-detail')?.textContent).not.toContain('Select a request');

    click(q('network-status-2xx')!);
    expect(qa('network-row')).toHaveLength(0);

    const list = q('network-list')!;
    expect(list.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('renders every row once a pane that MOUNTED already filtered to zero rows has its filter loosened (S4-27 residual 2)', () => {
    // Same defect and repro as ConsolePane's equivalent test — NetworkPane shares
    // `useVirtualWindow` and the same `hidden`-when-empty container. Reachable in production via
    // S4-26: opening a shared link whose hash filter matches nothing mounts this pane with
    // `visible.length === 0` from the start, so the container starts `hidden`
    // (`display: none`) — a real browser reports `clientHeight === 0` for that. Loosening the
    // filter afterward used to render only the ~5-row overscan window instead of the real list.
    const N = 20;
    render(logWith(N), { query: 'zzz-no-such-request' }); // mounts already filtered to zero
    expect(qa('network-row')).toHaveLength(0);

    const list = q('network-list')!;
    // jsdom never computes layout (`clientHeight` is always 0); stub it to mirror a real browser —
    // 0 while `hidden` is applied, a real viewport height once it is not (mirrors
    // use-active-descendant.test.tsx's clientHeight-stubbing idiom).
    Object.defineProperty(list, 'clientHeight', {
      configurable: true,
      get() {
        return list.classList.contains('hidden') ? 0 : 600; // plenty of room for all 20 rows
      },
    });

    typeInto(q('network-search') as HTMLInputElement, '');

    expect(qa('network-row')).toHaveLength(N);
  });
});
