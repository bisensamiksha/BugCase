// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import type { ReadReportResult } from './lib/read-report-zip';
import { fakeReportSource } from './test-utils/fake-report-source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Panes are lazy chunks (S4-05); preload them so React.lazy resolves within one Suspense flush.
beforeAll(async () => {
  await Promise.all([
    import('./panes/OverviewPane'),
    import('./panes/ConsolePane'),
    import('./panes/NetworkPane'),
    import('./panes/PanePlaceholder'),
  ]);
});

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  window.location.hash = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  window.location.hash = '';
});

function dropzone(): Element {
  const el = container.querySelector('[data-testid="dropzone"]');
  if (!el) {
    throw new Error('dropzone not found');
  }
  return el;
}

function dropFile(node: Element, file: File): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
  node.dispatchEvent(event);
}

const zipFile = (): File =>
  new File([new Uint8Array([1, 2, 3])], 'report.zip', { type: 'application/zip' });

describe('App', () => {
  it('renders the report JSON tree after a valid ZIP is dropped', async () => {
    let resolveRead!: (r: ReadReportResult) => void;
    const readPromise = new Promise<ReadReportResult>((resolve) => {
      resolveRead = resolve;
    });
    const read = vi.fn((_input: Blob) => readPromise);

    act(() => {
      root.render(<App read={read} />);
    });
    expect(container.querySelector('[data-testid="empty"]')).not.toBeNull();

    act(() => {
      dropFile(dropzone(), zipFile());
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="async-loading"]')).not.toBeNull();

    const report = { schemaVersion: 'v1', metadata: { id: 'abc-123' } } as unknown as BugReportV1;
    await act(async () => {
      resolveRead({ ok: true, source: fakeReportSource(report) });
      await readPromise;
    });
    // The overview is a lazy chunk (S4-05); flush the dynamic import + Suspense re-render.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The default route is the overview pane (S4-03); it surfaces the report's capture id.
    const section = container.querySelector('[data-testid="pane-overview"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('abc-123');
  });

  it('routes a loaded report into the console and network panes', async () => {
    const report = {
      schemaVersion: 'v1',
      metadata: { id: 'abc-123' },
      console: {
        schemaVersion: 'v1',
        capturedFromRingBuffer: true,
        capturedFromDebugger: false,
        bufferSize: 10,
        truncated: false,
        entries: [
          {
            id: 'c1',
            timestamp: '2026-06-27T12:00:00.000Z',
            level: 'warn',
            args: [{ type: 'string', preview: 'heads up' }],
          },
        ],
      },
      network: {
        schemaVersion: 'v1',
        capturedFromRingBuffer: true,
        capturedFromDebugger: false,
        entries: [
          {
            id: 'n1',
            url: 'https://example.com/api',
            method: 'GET',
            status: 200,
            statusText: 'OK',
            initiator: 'fetch',
            startedAt: '2026-06-27T12:00:00.000Z',
            endedAt: '2026-06-27T12:00:00.100Z',
            durationMs: 100,
            requestHeaders: [],
            responseHeaders: [],
            request: null,
            response: null,
            fromCache: false,
            failed: false,
            errorText: null,
          },
        ],
      },
    } as unknown as BugReportV1;
    const read = vi.fn((_input: Blob) =>
      Promise.resolve<ReadReportResult>({ ok: true, source: fakeReportSource(report) }),
    );

    // Start on the console pane.
    window.location.hash = '#/console';
    act(() => {
      root.render(<App read={read} />);
    });
    await act(async () => {
      dropFile(dropzone(), zipFile());
      await Promise.resolve();
    });

    // Only the active (console) pane renders; its data is present.
    expect(container.querySelector('[data-testid="console-pane"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="console-row"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="console-pane"]')?.textContent).toContain(
      'heads up',
    );
    expect(container.querySelector('[data-testid="network-pane"]')).toBeNull();

    // Switching the hash to the network pane routes the network data in, without re-reading the ZIP.
    await act(async () => {
      window.location.hash = '#/network';
      window.dispatchEvent(new Event('hashchange'));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="network-pane"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="network-row"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="console-pane"]')).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('shows an error message with a working Retry when the ZIP is invalid, without throwing', async () => {
    const read = vi.fn((_input: Blob) =>
      Promise.resolve<ReadReportResult>({ ok: false, error: 'File is not a valid ZIP archive' }),
    );

    act(() => {
      root.render(<App read={read} />);
    });
    await act(async () => {
      dropFile(dropzone(), zipFile());
      await Promise.resolve();
    });

    const error = container.querySelector('[data-testid="async-error"]');
    expect(error?.textContent).toContain('not a valid ZIP');
    expect(read).toHaveBeenCalledTimes(1);

    // Retry re-invokes the loader on the same (failed) file.
    const retry = container.querySelector('[data-testid="async-retry"]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    await act(async () => {
      retry.click();
      await Promise.resolve();
    });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
