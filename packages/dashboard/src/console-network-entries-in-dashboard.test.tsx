// @vitest-environment jsdom
import type { ConsoleLog, NetworkEntry, NetworkLog } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConsoleTable } from './panes/ConsoleTable';
import { NetworkTable } from './panes/NetworkTable';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function rows(testId: string): NodeListOf<HTMLElement> {
  return container.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`);
}

const consoleLog: ConsoleLog = {
  schemaVersion: 'v1',
  capturedFromRingBuffer: true,
  capturedFromDebugger: false,
  bufferSize: 100,
  truncated: false,
  entries: [
    {
      id: 'c1',
      timestamp: '2026-06-27T12:00:00.000Z',
      level: 'log',
      args: [{ type: 'string', preview: 'hello world' }],
    },
    {
      id: 'c2',
      timestamp: '2026-06-27T12:00:01.000Z',
      level: 'error',
      args: [
        { type: 'string', preview: 'boom:' },
        { type: 'number', preview: '42' },
      ],
    },
  ],
};

const networkEntry = (overrides: Partial<NetworkEntry>): NetworkEntry => ({
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
  ...overrides,
});

const networkLog: NetworkLog = {
  schemaVersion: 'v1',
  capturedFromRingBuffer: true,
  capturedFromDebugger: false,
  entries: [
    networkEntry({ id: 'n1', method: 'GET', status: 200, url: 'https://example.com/ok' }),
    networkEntry({
      id: 'n2',
      method: 'POST',
      status: null,
      statusText: null,
      url: 'https://example.com/fail',
      durationMs: null,
      endedAt: null,
      failed: true,
      errorText: 'net::ERR_FAILED',
    }),
  ],
};

describe('ConsoleTable', () => {
  it('renders one row per entry with level and message preview', () => {
    act(() => {
      root.render(<ConsoleTable log={consoleLog} />);
    });
    const consoleRows = rows('console-row');
    expect(consoleRows).toHaveLength(2);
    expect(consoleRows[0]?.textContent).toContain('log');
    expect(consoleRows[0]?.textContent).toContain('hello world');
    // Multiple args are joined into a single message preview.
    expect(consoleRows[1]?.textContent).toContain('error');
    expect(consoleRows[1]?.textContent).toContain('boom:');
    expect(consoleRows[1]?.textContent).toContain('42');
  });

  it('shows an empty state when the console log is null', () => {
    act(() => {
      root.render(<ConsoleTable log={null} />);
    });
    expect(container.querySelector('[data-testid="console-empty"]')).not.toBeNull();
    expect(rows('console-row')).toHaveLength(0);
  });

  it('shows an empty state when there are no entries', () => {
    act(() => {
      root.render(<ConsoleTable log={{ ...consoleLog, entries: [] }} />);
    });
    expect(container.querySelector('[data-testid="console-empty"]')).not.toBeNull();
    expect(rows('console-row')).toHaveLength(0);
  });
});

describe('NetworkTable', () => {
  it('renders one row per entry with method, url and status', () => {
    act(() => {
      root.render(<NetworkTable log={networkLog} />);
    });
    const networkRows = rows('network-row');
    expect(networkRows).toHaveLength(2);
    expect(networkRows[0]?.textContent).toContain('GET');
    expect(networkRows[0]?.textContent).toContain('https://example.com/ok');
    expect(networkRows[0]?.textContent).toContain('200');
  });

  it('renders a failed/null-status entry with a placeholder, without throwing', () => {
    act(() => {
      root.render(<NetworkTable log={networkLog} />);
    });
    const networkRows = rows('network-row');
    expect(networkRows[1]?.textContent).toContain('POST');
    // Null status/duration must not render "null"; a dash placeholder is used instead.
    expect(networkRows[1]?.textContent).not.toContain('null');
    expect(networkRows[1]?.textContent).toContain('—');
  });

  it('shows an empty state when the network log is null', () => {
    act(() => {
      root.render(<NetworkTable log={null} />);
    });
    expect(container.querySelector('[data-testid="network-empty"]')).not.toBeNull();
    expect(rows('network-row')).toHaveLength(0);
  });
});
