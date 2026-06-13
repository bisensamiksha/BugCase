// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CaptureButton → request-capture → lib/browser; stub the polyfill so the import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { CaptureReportResponse } from '../background/messages';

import { CaptureButton } from './CaptureButton';

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

function button(): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>('[data-testid="capture-button"]');
  if (!el) {
    throw new Error('capture button not found');
  }
  return el;
}

describe('CaptureButton', () => {
  it('runs capture on click, shows progress, then reports completion', async () => {
    let resolveCapture!: (r: CaptureReportResponse) => void;
    const capturePromise = new Promise<CaptureReportResponse>((resolve) => {
      resolveCapture = resolve;
    });
    const onCapture = vi.fn(() => capturePromise);
    const onComplete = vi.fn();

    act(() => {
      root.render(<CaptureButton onCapture={onCapture} onComplete={onComplete} />);
    });

    act(() => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().disabled).toBe(true);

    await act(async () => {
      resolveCapture({ ok: true, downloadId: 1, filename: 'bugcase-example-com-x.zip' });
      await capturePromise;
    });

    expect(onComplete).toHaveBeenCalledWith({
      ok: true,
      downloadId: 1,
      filename: 'bugcase-example-com-x.zip',
    });
    expect(button().getAttribute('aria-busy')).toBe('false');
    expect(container.querySelector('[data-testid="capture-status"]')?.textContent).toContain(
      'bugcase-example-com-x.zip',
    );
  });

  it('shows an error message when capture fails, without throwing', async () => {
    const response: CaptureReportResponse = { ok: false, reason: 'activeTab not granted' };
    const capturePromise = Promise.resolve(response);
    const onCapture = vi.fn(() => capturePromise);

    act(() => {
      root.render(<CaptureButton onCapture={onCapture} />);
    });
    await act(async () => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await capturePromise;
    });

    expect(container.querySelector('[data-testid="capture-status"]')?.textContent).toContain(
      'activeTab',
    );
    expect(button().getAttribute('aria-busy')).toBe('false');
  });
});
