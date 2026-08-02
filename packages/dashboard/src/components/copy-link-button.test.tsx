// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyLinkButton } from './CopyLinkButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

/** Install a clipboard whose `writeText` resolves or rejects on demand. */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

/** Remove the clipboard API entirely — some `file://` contexts expose none. */
function removeClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

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

const button = () => container.querySelector<HTMLButtonElement>('[data-testid="copy-link"]');
const status = () => container.querySelector('[data-testid="copy-link-status"]')?.textContent ?? '';
const error = () => container.querySelector('[data-testid="copy-link-error"]');

async function click() {
  await act(async () => {
    button()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('CopyLinkButton', () => {
  it('copies the current URL', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    stubClipboard(writeText);
    window.location.hash = '#/console/r1?q=timeout';

    act(() => {
      root.render(<CopyLinkButton />);
    });
    await click();

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(writeText.mock.calls[0]?.[0]).toContain('q=timeout');
  });

  it('confirms the copy for assistive technology', async () => {
    stubClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue());

    act(() => {
      root.render(<CopyLinkButton />);
    });
    await click();

    expect(status()).toContain('copied');
    expect(error()).toBeNull();
  });

  it('reports a rejected write instead of failing silently', async () => {
    stubClipboard(vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied')));

    act(() => {
      root.render(<CopyLinkButton />);
    });
    await click();

    expect(error()).not.toBeNull();
    expect(error()?.getAttribute('role')).toBe('alert');
  });

  it('reports an absent clipboard API', async () => {
    removeClipboard();

    act(() => {
      root.render(<CopyLinkButton />);
    });
    await click();

    expect(error()?.textContent).toContain('unavailable');
  });

  it('stays usable after a failure', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValue();
    stubClipboard(writeText);

    act(() => {
      root.render(<CopyLinkButton />);
    });
    await click();
    expect(error()).not.toBeNull();

    await click();
    expect(error()).toBeNull();
    expect(status()).toContain('copied');
  });

  it('is hidden from print output', () => {
    act(() => {
      root.render(<CopyLinkButton />);
    });

    expect(button()?.closest('[data-print-hide]')).not.toBeNull();
  });
});
