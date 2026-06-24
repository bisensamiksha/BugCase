// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// OverlayApp's children reach lib/browser; stub the polyfill so import succeeds. The opt-in
// check is injected in every test, so the real runtime bridge is never invoked.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { OverlayApp } from './OverlayApp';

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

function queryTestId(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

describe('OverlayApp passive-monitoring opt-in', () => {
  it('prompts to enable monitoring on an origin that is not yet allowlisted', async () => {
    const promise = Promise.resolve(false);
    const checkAllowed = vi.fn(() => promise);

    act(() => {
      root.render(
        <OverlayApp onClose={() => {}} origin="https://example.com" checkAllowed={checkAllowed} />,
      );
    });
    await act(async () => {
      await promise;
    });

    expect(checkAllowed).toHaveBeenCalledWith('https://example.com');
    expect(queryTestId('origin-opt-in')).not.toBeNull();
    // The capture UI is always present too.
    expect(queryTestId('bugcase-overlay')).not.toBeNull();
  });

  it('does not prompt when the origin is already allowlisted', async () => {
    const promise = Promise.resolve(true);
    const checkAllowed = vi.fn(() => promise);

    act(() => {
      root.render(
        <OverlayApp onClose={() => {}} origin="https://example.com" checkAllowed={checkAllowed} />,
      );
    });
    await act(async () => {
      await promise;
    });

    expect(queryTestId('origin-opt-in')).toBeNull();
  });

  it('shows the debugger banner only while a debugger-activity message reports active', () => {
    let handler: ((active: boolean, hostName?: string) => void) | undefined;
    const subscribeDebuggerActivity = vi.fn((cb: typeof handler) => {
      handler = cb;
      return () => {};
    });

    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          subscribeDebuggerActivity={subscribeDebuggerActivity}
        />,
      );
    });
    expect(queryTestId('debugger-banner')).toBeNull();

    act(() => {
      handler?.(true, 'example.com');
    });
    const banner = queryTestId('debugger-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('example.com');

    act(() => {
      handler?.(false);
    });
    expect(queryTestId('debugger-banner')).toBeNull();
  });

  it('never prompts for a non-http(s) origin and skips the lookup', () => {
    const checkAllowed = vi.fn(() => Promise.resolve(false));

    act(() => {
      root.render(
        <OverlayApp onClose={() => {}} origin="about:blank" checkAllowed={checkAllowed} />,
      );
    });

    expect(checkAllowed).not.toHaveBeenCalled();
    expect(queryTestId('origin-opt-in')).toBeNull();
  });
});

describe('OverlayApp cookies warning', () => {
  it('warns that cookies are captured when the cookies permission is granted', async () => {
    const granted = Promise.resolve(true);
    const checkCookiesGranted = vi.fn(() => granted);

    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={checkCookiesGranted}
        />,
      );
    });
    await act(async () => {
      await granted;
    });

    expect(checkCookiesGranted).toHaveBeenCalled();
    const warning = queryTestId('cookies-warning');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain('example.com');
  });

  it('does not warn when the cookies permission is not granted', async () => {
    const denied = Promise.resolve(false);

    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          checkCookiesGranted={() => denied}
        />,
      );
    });
    await act(async () => {
      await denied;
    });

    expect(queryTestId('cookies-warning')).toBeNull();
  });
});
