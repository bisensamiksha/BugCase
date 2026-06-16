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
