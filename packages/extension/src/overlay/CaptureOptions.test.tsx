// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CaptureOptions reaches lib/browser via the permissions bridge; stub the polyfill. The permission
// check is injected in every test, so the real bridge is never invoked.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { CaptureOptions } from './CaptureOptions';
import { CAPTURE_OPTION_DEFAULTS } from './capture-options-state';

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

function checkbox(key: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`[data-testid="capture-option-${key}"]`);
  if (!el) {
    throw new Error(`missing checkbox ${key}`);
  }
  return el;
}

function query(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

describe('CaptureOptions', () => {
  it('renders each option with checked state from value', () => {
    act(() => {
      root.render(
        <CaptureOptions
          value={CAPTURE_OPTION_DEFAULTS}
          onChange={() => {}}
          checkPermission={() => Promise.resolve(true)}
        />,
      );
    });
    expect(checkbox('viewportScreenshot').checked).toBe(true);
    expect(checkbox('screenInfo').checked).toBe(true);
    expect(checkbox('domSnapshot').checked).toBe(false);
    expect(checkbox('cookies').checked).toBe(false);
  });

  it('toggles a non-gated option without checking a permission', () => {
    const onChange = vi.fn();
    const checkPermission = vi.fn(() => Promise.resolve(true));
    act(() => {
      root.render(
        <CaptureOptions
          value={CAPTURE_OPTION_DEFAULTS}
          onChange={onChange}
          checkPermission={checkPermission}
        />,
      );
    });
    act(() => {
      checkbox('domSnapshot').click();
    });
    expect(checkPermission).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ domSnapshot: true }));
  });

  it('enables a gated option when its permission is already granted', async () => {
    const onChange = vi.fn();
    const checkPermission = vi.fn(() => Promise.resolve(true));
    act(() => {
      root.render(
        <CaptureOptions
          value={CAPTURE_OPTION_DEFAULTS}
          onChange={onChange}
          checkPermission={checkPermission}
        />,
      );
    });
    const granted = Promise.resolve(true);
    await act(async () => {
      checkbox('cookies').click();
      await granted;
    });
    expect(checkPermission).toHaveBeenCalledWith('cookies');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cookies: true }));
  });

  it('leaves a gated option off and points to the popup when not yet granted', async () => {
    const onChange = vi.fn();
    const notGranted = Promise.resolve(false);
    act(() => {
      root.render(
        <CaptureOptions
          value={CAPTURE_OPTION_DEFAULTS}
          onChange={onChange}
          checkPermission={() => notGranted}
        />,
      );
    });
    await act(async () => {
      checkbox('cookies').click();
      await notGranted;
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="capture-option-needs-grant-cookies"]'),
    ).not.toBeNull();
  });

  it('treats a rejecting permission check as not granted instead of leaking a rejection', async () => {
    // MINOR 5: `checkPermission` is a documented injectable prop. A rejection out of the click
    // handler would be an unhandled rejection; "not granted" is the safe reading.
    const onChange = vi.fn();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const rejected = Promise.reject(new Error('bridge down'));
    rejected.catch(() => {});

    act(() => {
      root.render(
        <CaptureOptions
          value={CAPTURE_OPTION_DEFAULTS}
          onChange={onChange}
          checkPermission={() => rejected}
        />,
      );
    });
    await act(async () => {
      checkbox('cookies').click();
      await rejected.catch(() => {});
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(query('capture-option-needs-grant-cookies')).not.toBeNull();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('unchecks a gated option without checking a permission', () => {
    const onChange = vi.fn();
    const checkPermission = vi.fn(() => Promise.resolve(true));
    act(() => {
      root.render(
        <CaptureOptions
          value={{ ...CAPTURE_OPTION_DEFAULTS, cookies: true }}
          onChange={onChange}
          checkPermission={checkPermission}
        />,
      );
    });
    expect(checkbox('cookies').checked).toBe(true);
    act(() => {
      checkbox('cookies').click();
    });
    expect(checkPermission).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cookies: false }));
  });
});

describe('CaptureOptions permission labels', () => {
  it('renders no permission label when the permission is granted', () => {
    act(() => {
      root.render(
        <CaptureOptions
          value={{ ...CAPTURE_OPTION_DEFAULTS, cookies: true }}
          onChange={() => {}}
          checkPermission={() => Promise.resolve(true)}
          grantedPermissions={new Set(['cookies', 'management', 'history'])}
        />,
      );
    });
    expect(query('capture-option-needs-permission-cookies')).toBeNull();
    expect(query('capture-option-permission-revoked-cookies')).toBeNull();
  });

  it('renders the needs-permission label when ungranted and unticked', () => {
    act(() => {
      root.render(
        <CaptureOptions
          value={{ ...CAPTURE_OPTION_DEFAULTS, cookies: false }}
          onChange={() => {}}
          checkPermission={() => Promise.resolve(false)}
          grantedPermissions={new Set()}
        />,
      );
    });
    expect(query('capture-option-needs-permission-cookies')?.textContent).toContain(
      'needs permission',
    );
    expect(query('capture-option-permission-revoked-cookies')).toBeNull();
  });

  it('renders the not-granted label when ungranted but still ticked', () => {
    act(() => {
      root.render(
        <CaptureOptions
          value={{ ...CAPTURE_OPTION_DEFAULTS, cookies: true }}
          onChange={() => {}}
          checkPermission={() => Promise.resolve(false)}
          grantedPermissions={new Set()}
        />,
      );
    });
    // MINOR 3: Settings never reconciles and stubs the check to `true`, so a user can tick a gated
    // option there without ever granting — "revoked" would be false in the common case.
    expect(query('capture-option-permission-revoked-cookies')?.textContent).toBe(
      'permission not granted. Grant it in the toolbar popup to use this',
    );
    expect(query('capture-option-needs-permission-cookies')).toBeNull();
  });

  it('labels each gated option against its own permission on a mixed grant set', () => {
    // Blind spot: with only all-granted / none-granted sets, swapping `management` and `history`
    // would pass every test.
    act(() => {
      root.render(
        <CaptureOptions
          value={{
            ...CAPTURE_OPTION_DEFAULTS,
            cookies: true,
            installedExtensions: true,
            navigationHistory: true,
          }}
          onChange={() => {}}
          checkPermission={() => Promise.resolve(false)}
          grantedPermissions={new Set(['history'])}
        />,
      );
    });
    expect(query('capture-option-permission-revoked-navigationHistory')).toBeNull();
    expect(query('capture-option-needs-permission-navigationHistory')).toBeNull();
    expect(query('capture-option-permission-revoked-cookies')).not.toBeNull();
    expect(query('capture-option-permission-revoked-installedExtensions')).not.toBeNull();
  });

  it('does not stack the toggle hint on a row whose label already explains it', async () => {
    // MINOR 2: after a failed toggle the row used to read both "needs permission. Enable in the
    // toolbar popup" and "Enable from the toolbar popup".
    const notGranted = Promise.resolve(false);
    act(() => {
      root.render(
        <CaptureOptions
          value={{ ...CAPTURE_OPTION_DEFAULTS, cookies: false }}
          onChange={() => {}}
          checkPermission={() => notGranted}
          grantedPermissions={new Set()}
        />,
      );
    });
    await act(async () => {
      checkbox('cookies').click();
      await notGranted;
    });

    expect(query('capture-option-needs-permission-cookies')).not.toBeNull();
    expect(query('capture-option-needs-grant-cookies')).toBeNull();
  });

  it('renders no permission label while grants are unknown', () => {
    act(() => {
      root.render(
        <CaptureOptions
          value={{ ...CAPTURE_OPTION_DEFAULTS, cookies: true }}
          onChange={() => {}}
          checkPermission={() => Promise.resolve(false)}
        />,
      );
    });
    expect(query('capture-option-needs-permission-cookies')).toBeNull();
    expect(query('capture-option-permission-revoked-cookies')).toBeNull();
  });

  it('never renders a permission label on a non-gated option', () => {
    act(() => {
      root.render(
        <CaptureOptions
          value={{ ...CAPTURE_OPTION_DEFAULTS, consoleLogs: true }}
          onChange={() => {}}
          checkPermission={() => Promise.resolve(false)}
          grantedPermissions={new Set()}
        />,
      );
    });
    expect(query('capture-option-needs-permission-consoleLogs')).toBeNull();
    expect(query('capture-option-permission-revoked-consoleLogs')).toBeNull();
  });
});
