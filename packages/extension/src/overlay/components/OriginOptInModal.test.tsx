// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The modal's default onEnable sends via lib/browser; stub the polyfill so import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { OriginAllowlistResponse } from '../../background/origin-allowlist-handler';

import { OriginOptInModal } from './OriginOptInModal';

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

function byTestId(id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) {
    throw new Error(`element not found: ${id}`);
  }
  return el;
}

describe('OriginOptInModal', () => {
  it('names the origin being prompted', () => {
    act(() => {
      root.render(<OriginOptInModal origin="https://example.com" />);
    });
    expect(container.textContent).toContain('https://example.com');
  });

  it('enables monitoring on Enable and shows the enabled state', async () => {
    const response: OriginAllowlistResponse = { ok: true, origins: ['https://example.com'] };
    const promise = Promise.resolve(response);
    const onEnable = vi.fn(() => promise);
    const onResult = vi.fn();

    act(() => {
      root.render(
        <OriginOptInModal origin="https://example.com" onEnable={onEnable} onResult={onResult} />,
      );
    });
    await act(async () => {
      byTestId('origin-enable').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await promise;
    });

    expect(onEnable).toHaveBeenCalledWith('https://example.com');
    expect(onResult).toHaveBeenCalledWith(response);
    expect(byTestId('origin-status').textContent?.toLowerCase()).toContain('enabled');
  });

  it('shows an error state when the bridge reports failure', async () => {
    const promise = Promise.resolve<OriginAllowlistResponse>({
      ok: false,
      origins: [],
      reason: 'storage blew up',
    });
    const onEnable = vi.fn(() => promise);

    act(() => {
      root.render(<OriginOptInModal origin="https://example.com" onEnable={onEnable} />);
    });
    await act(async () => {
      byTestId('origin-enable').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await promise;
    });

    expect(byTestId('origin-status').textContent).toContain('storage blew up');
  });

  it('dismisses on "Not now" without enabling', () => {
    const onEnable = vi.fn(() =>
      Promise.resolve<OriginAllowlistResponse>({ ok: true, origins: [] }),
    );
    const onDismiss = vi.fn();

    act(() => {
      root.render(
        <OriginOptInModal origin="https://example.com" onEnable={onEnable} onDismiss={onDismiss} />,
      );
    });
    act(() => {
      byTestId('origin-dismiss').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onEnable).not.toHaveBeenCalled();
  });
});
