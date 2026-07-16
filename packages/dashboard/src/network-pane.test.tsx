// @vitest-environment jsdom
import type { NetworkEntry, NetworkLog } from '@bugcase/schema';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkPane } from './panes/NetworkPane';

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

function render(log: NetworkLog | null) {
  act(() => {
    root.render(<NetworkPane log={log} />);
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
});
