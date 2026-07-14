// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Lightbox, type LightboxProps } from './Lightbox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function render(props: Partial<LightboxProps> = {}) {
  await act(async () => {
    root.render(
      <Lightbox
        alt="Test image"
        load={() => Promise.resolve('data:image/png;base64,AAAA')}
        {...props}
      />,
    );
    await Promise.resolve();
  });
  // Settle the load() -> setSrc chain deterministically.
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

describe('Lightbox', () => {
  it('loads and shows the image from load()', async () => {
    await render();
    expect((q('lightbox-image') as HTMLImageElement).src).toContain('data:image/png;base64,AAAA');
    expect((q('lightbox-image') as HTMLImageElement).alt).toBe('Test image');
  });

  it('shows an error state when load() resolves null (no throw)', async () => {
    await render({ load: () => Promise.resolve(null) });
    expect(q('lightbox-image')).toBeNull();
    expect(q('lightbox-error')).not.toBeNull();
  });

  it('shows an error state when load() rejects (no throw)', async () => {
    await render({ load: () => Promise.reject(new Error('boom')) });
    expect(q('lightbox-error')).not.toBeNull();
  });

  it('renders a custom errorMessage', async () => {
    await render({ load: () => Promise.resolve(null), errorMessage: 'Custom failure.' });
    expect(q('lightbox-error')?.textContent).toContain('Custom failure.');
  });

  it('closes on Escape / × / backdrop', async () => {
    const onCancel = vi.fn();
    await render({ onCancel });
    press('Escape');
    act(() => {
      q('lightbox-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      q('lightbox-backdrop')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(3);
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
