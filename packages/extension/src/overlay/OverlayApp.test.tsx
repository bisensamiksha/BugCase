// @vitest-environment jsdom
import type { BugReportV1 } from '@bugcase/schema';
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

describe('OverlayApp capture options', () => {
  it('renders the grouped capture-options checkboxes', () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
        />,
      );
    });
    expect(queryTestId('capture-options')).not.toBeNull();
    expect(queryTestId('capture-option-viewportScreenshot')).not.toBeNull();
  });

  it('renders the severity + steps + notes form', () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
        />,
      );
    });
    expect(queryTestId('user-report-form')).not.toBeNull();
    expect(queryTestId('user-report-severity')).not.toBeNull();
    expect(queryTestId('user-report-steps')).not.toBeNull();
    expect(queryTestId('user-report-notes')).not.toBeNull();
  });
});

describe('OverlayApp layout', () => {
  it('caps the panel height to the viewport and scrolls overflow internally', () => {
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
        />,
      );
    });
    const panel = queryTestId('bugcase-overlay');
    expect(panel).not.toBeNull();
    // A fixed-position panel taller than the viewport must scroll itself; otherwise the controls
    // below the fold (notes, capture button) become unreachable.
    expect(panel?.style.overflowY).toBe('auto');
    expect(panel?.style.maxHeight).not.toBe('');
  });
});

describe('OverlayApp capture → preview', () => {
  function previewReport(): BugReportV1 {
    return {
      schemaVersion: 'v1',
      metadata: { page: { origin: 'https://example.com' } },
      userInput: {
        schemaVersion: 'v1',
        title: '',
        stepsToReproduce: '',
        severity: 'minor',
        notes: '',
      },
      screenshots: { schemaVersion: 'v1', elementCrops: [] },
      browser: null,
      console: null,
      network: null,
      dom: null,
      storage: null,
      cookies: null,
      navigation: null,
      reproduction: null,
      elementInspections: null,
    } as unknown as BugReportV1;
  }

  it('switches from the capture form to the preview after a successful capture', async () => {
    const response = { ok: true, reportId: 'r1', report: previewReport() };
    const onCapture = vi.fn(() => Promise.resolve(response));
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          onCapture={onCapture}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      queryTestId('capture-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve(response);
    });

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(queryTestId('preview-review-screen-scaffold')).not.toBeNull();
    expect(queryTestId('capture-button')).toBeNull();
  });

  it('returns to the capture form when preview is cancelled', async () => {
    const onCapture = vi.fn(() =>
      Promise.resolve({ ok: true, reportId: 'r1', report: previewReport() }),
    );
    act(() => {
      root.render(
        <OverlayApp
          onClose={() => {}}
          origin="https://example.com"
          checkAllowed={() => Promise.resolve(true)}
          onCapture={onCapture}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      queryTestId('capture-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    act(() => {
      queryTestId('preview-cancel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(queryTestId('capture-button')).not.toBeNull();
    expect(queryTestId('preview-review-screen-scaffold')).toBeNull();
  });
});
