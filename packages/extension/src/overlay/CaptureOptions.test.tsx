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
