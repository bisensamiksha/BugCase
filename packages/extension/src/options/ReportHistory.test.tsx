// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ReportHistory transitively imports lib/browser; stub the polyfill so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { ReportHistoryEntry } from '../storage/report-history';

import { ReportHistory, type ReportHistoryProps } from './ReportHistory';

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

function q(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}
function qa(id: string): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

function entry(overrides: Partial<ReportHistoryEntry> = {}): ReportHistoryEntry {
  return {
    id: 'cap-1',
    capturedAt: '2026-07-02T10:00:00.000Z',
    url: 'https://example.com/page',
    title: 'Example page',
    origin: 'https://example.com',
    filename: 'bugcase-example-com.zip',
    byteSize: 1536,
    artifacts: ['screenshot', 'metadata'],
    downloadId: 7,
    toolVersion: '0.1.0',
    ...overrides,
  };
}

async function renderHistory(props: Partial<ReportHistoryProps> = {}): Promise<void> {
  await act(async () => {
    root.render(<ReportHistory loadHistory={() => Promise.resolve([])} {...props} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(el: HTMLElement | null): Promise<void> {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ReportHistory', () => {
  it('renders the empty state when there are no captures', async () => {
    await renderHistory({ loadHistory: () => Promise.resolve([]) });
    expect(q('report-history-empty')).not.toBeNull();
    expect(qa('history-row')).toHaveLength(0);
  });

  it('lists past captures with title, origin, size, and artifact count', async () => {
    await renderHistory({
      loadHistory: () => Promise.resolve([entry({ id: 'a' }), entry({ id: 'b' })]),
    });
    expect(qa('history-row')).toHaveLength(2);
    expect(container.textContent).toContain('Example page');
    expect(container.textContent).toContain('https://example.com');
    expect(container.textContent).toContain('1.5 KB');
  });

  it('reveals a downloaded report via the injected reveal handler', async () => {
    const reveal = vi.fn(() => Promise.resolve({ revealed: true, filename: 'x.zip' }));
    await renderHistory({
      loadHistory: () => Promise.resolve([entry({ id: 'a', downloadId: 9 })]),
      reveal,
    });
    await click(q('history-reveal-a'));
    expect(reveal).toHaveBeenCalledWith(9, 'bugcase-example-com.zip');
  });

  it('shows a fallback hint when reveal cannot open the file', async () => {
    const reveal = vi.fn(() =>
      Promise.resolve({ revealed: false, filename: 'bugcase-example-com.zip' }),
    );
    await renderHistory({ loadHistory: () => Promise.resolve([entry({ id: 'a' })]), reveal });
    await click(q('history-reveal-a'));
    expect(q('history-reveal-msg')?.textContent).toContain('bugcase-example-com.zip');
  });

  it('removes an entry via the injected remove handler', async () => {
    const removeEntry = vi.fn(() => Promise.resolve([entry({ id: 'b' })]));
    await renderHistory({
      loadHistory: () => Promise.resolve([entry({ id: 'a' }), entry({ id: 'b' })]),
      removeEntry,
    });
    await click(q('history-remove-a'));
    expect(removeEntry).toHaveBeenCalledWith('a');
    expect(qa('history-row')).toHaveLength(1);
  });

  it('clears all history via the injected clear handler', async () => {
    const clearHistory = vi.fn(() => Promise.resolve());
    await renderHistory({
      loadHistory: () => Promise.resolve([entry({ id: 'a' })]),
      clearHistory,
    });
    await click(q('history-clear'));
    expect(clearHistory).toHaveBeenCalled();
    expect(q('report-history-empty')).not.toBeNull();
  });
});
