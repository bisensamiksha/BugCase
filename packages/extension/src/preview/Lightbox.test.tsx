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
    await Promise.resolve(); // flush the peekAsset promise so status settles
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

describe('LightboxScreenshotViewer', () => {
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

  it('closes on Escape', async () => {
    const onCancel = vi.fn();
    await render({ onCancel });
    press('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes from the × button', async () => {
    const onCancel = vi.fn();
    await render({ onCancel });
    act(() => {
      q('lightbox-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop click', async () => {
    const onCancel = vi.fn();
    await render({ onCancel });
    act(() => {
      q('lightbox-backdrop')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('zooms with + / 0 keys (transform on the image)', async () => {
    await render();
    press('+');
    expect((q('lightbox-image') as HTMLElement).style.transform).toContain('scale(1.25)');
    press('0');
    expect((q('lightbox-image') as HTMLElement).style.transform).toContain('scale(1)');
  });

  it('marks aria-busy and ignores keys when disabled', async () => {
    const onCancel = vi.fn();
    await render({ disabled: true, onCancel });
    expect(q('lightbox-screenshot-viewer')?.getAttribute('aria-busy')).toBe('true');
    press('Escape');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
