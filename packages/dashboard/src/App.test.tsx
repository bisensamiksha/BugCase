// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import type { ReadReportResult } from './lib/read-report-zip';

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
    expect(container.querySelector('[data-testid="status"]')).not.toBeNull();

    const report = { schemaVersion: 'v1', metadata: { id: 'abc-123' } } as unknown as BugReportV1;
    await act(async () => {
      resolveRead({ ok: true, report });
      await readPromise;
    });

    const section = container.querySelector('[data-testid="report"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('abc-123');
  });

  it('shows an error message when the ZIP is invalid, without throwing', async () => {
    const readPromise = Promise.resolve<ReadReportResult>({
      ok: false,
      error: 'File is not a valid ZIP archive',
    });
    const read = vi.fn((_input: Blob) => readPromise);

    act(() => {
      root.render(<App read={read} />);
    });
    await act(async () => {
      dropFile(dropzone(), zipFile());
      await readPromise;
    });

    expect(container.querySelector('[data-testid="error"]')?.textContent).toContain(
      'not a valid ZIP',
    );
  });
});
