// @vitest-environment jsdom
import type { ScreenshotRef } from '@bugcase/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import { LightboxScreenshotViewer, type LightboxScreenshotViewerProps } from './Lightbox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const screenshot: ScreenshotRef = {
  path: 'raw/screenshot-viewport.png',
  width: 800,
  height: 600,
  devicePixelRatio: 1,
  captureMethod: 'visibleTab',
  hasAnnotations: false,
};

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function render(props: Partial<LightboxScreenshotViewerProps> = {}) {
  const peekAsset =
    props.peekAsset ?? (() => Promise.resolve({ ok: true, dataUrl: 'data:image/png;base64,AAAA' }));
  await act(async () => {
    root.render(
      <LightboxScreenshotViewer
        reportId="r1"
        screenshot={screenshot}
        {...props}
        peekAsset={peekAsset}
      />,
    );
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function press(key: string) {
  act(() => {
    q('lightbox-screenshot-viewer')!.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
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

describe('LightboxScreenshotViewer (adapter)', () => {
  it('loads and shows the screenshot from peekAsset', async () => {
    await render();
    expect((q('lightbox-image') as HTMLImageElement).src).toContain('data:image/png;base64,AAAA');
  });

  it('shows an error state when the hold expired (no throw)', async () => {
    await render({ peekAsset: () => Promise.resolve({ ok: false, reason: 'expired' }) });
    expect(q('lightbox-image')).toBeNull();
    expect(q('lightbox-error')).not.toBeNull();
  });

  it('shows an error state when peekAsset rejects (no throw)', async () => {
    await render({ peekAsset: () => Promise.reject(new Error('boom')) });
    expect(q('lightbox-error')).not.toBeNull();
  });

  it('shows an error state when there is no reportId', async () => {
    // Render without `reportId` (omitted, not `undefined`) — the adapter's load returns null.
    await act(async () => {
      root.render(
        <LightboxScreenshotViewer
          screenshot={screenshot}
          peekAsset={() => Promise.resolve({ ok: true, dataUrl: 'data:image/png;base64,AAAA' })}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(q('lightbox-error')).not.toBeNull();
  });

  it('closes on Escape via the wired onCancel', async () => {
    const onCancel = vi.fn();
    await render({ onCancel });
    press('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('marks aria-busy and ignores keys when disabled', async () => {
    const onCancel = vi.fn();
    await render({ disabled: true, onCancel });
    expect(q('lightbox-screenshot-viewer')?.getAttribute('aria-busy')).toBe('true');
    press('Escape');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
