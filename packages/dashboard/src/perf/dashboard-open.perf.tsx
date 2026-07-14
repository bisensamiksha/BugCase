// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from '../App';
import { readReportZip } from '../lib/read-report-zip';
import type { ReportSource } from '../lib/report-source';

import { generateLargeReportZip } from './generate-fixture';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  window.location.hash = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.location.hash = '';
});

function dropFile(node: Element, file: File): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
  node.dispatchEvent(event);
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('dashboard perf budget (S4-05)', () => {
  it('opens a ~50MB report to an interactive overview under 2s, without decompressing binaries', async () => {
    // Fixture generation is setup, not part of the measured budget.
    const blob = await generateLargeReportZip(50 * 1024 * 1024);

    // Count binary-entry reads so we can prove the open→overview path never decompresses them.
    let binaryReads = 0;
    const read = async (input: Blob) => {
      const result = await readReportZip(input);
      if (!result.ok) {
        return result;
      }
      const inner = result.source;
      const wrapped: ReportSource = {
        report: inner.report,
        readText: (path) => inner.readText(path),
        readBlob: (path) => {
          binaryReads += 1;
          return inner.readBlob(path);
        },
        objectUrl: (path) => {
          binaryReads += 1;
          return inner.objectUrl(path);
        },
        dispose: () => inner.dispose(),
      };
      return { ok: true as const, source: wrapped };
    };

    const start = performance.now();
    act(() => {
      root.render(<App read={read} />);
    });
    const dropzone = container.querySelector('[data-testid="dropzone"]');
    expect(dropzone).not.toBeNull();
    await act(async () => {
      dropFile(dropzone!, new File([blob], 'big.zip', { type: 'application/zip' }));
      await Promise.resolve();
    });
    // Bounded, condition-based wait for the lazy overview chunk to become interactive.
    for (let i = 0; i < 100 && !container.querySelector('[data-testid="pane-overview"]'); i += 1) {
      await flush();
    }
    const elapsedMs = performance.now() - start;

    expect(container.querySelector('[data-testid="pane-overview"]')).not.toBeNull();
    // Laziness (the real guarantee): opening + rendering the overview touched no binary entry.
    expect(binaryReads).toBe(0);
    // Budget: a generous ceiling — binaries are never decompressed, so this stays far under.
    expect(elapsedMs).toBeLessThan(2000);
  });
});
