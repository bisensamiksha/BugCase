// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The defaults reach lib/browser; stub the polyfill so import succeeds. Tests inject the
// get/set functions, so the real chrome.storage API is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { DebuggerCapturePref } from './DebuggerCapturePref';

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

function toggle(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>('[data-testid="debugger-capture-pref"]');
  if (!el) {
    throw new Error('toggle not found');
  }
  return el;
}

describe('DebuggerCapturePref', () => {
  it('reflects the stored opt-in on mount', async () => {
    const stored = Promise.resolve(true);
    await act(async () => {
      root.render(
        <DebuggerCapturePref getEnabled={() => stored} setEnabled={() => Promise.resolve()} />,
      );
      await stored;
    });
    expect(toggle().checked).toBe(true);
    expect(container.textContent?.toLowerCase()).toContain('debugger');
  });

  it('starts unchecked when the opt-in is off', async () => {
    await act(async () => {
      root.render(
        <DebuggerCapturePref
          getEnabled={() => Promise.resolve(false)}
          setEnabled={() => Promise.resolve()}
        />,
      );
      await Promise.resolve();
    });
    expect(toggle().checked).toBe(false);
  });

  it('persists and checks when enabled (no permission prompt)', async () => {
    const setEnabled = vi.fn(() => Promise.resolve());
    await act(async () => {
      root.render(
        <DebuggerCapturePref getEnabled={() => Promise.resolve(false)} setEnabled={setEnabled} />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      toggle().click();
      await Promise.resolve();
    });
    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(toggle().checked).toBe(true);
  });

  it('persists false and unchecks when disabled', async () => {
    const setEnabled = vi.fn(() => Promise.resolve());
    const stored = Promise.resolve(true);
    await act(async () => {
      root.render(<DebuggerCapturePref getEnabled={() => stored} setEnabled={setEnabled} />);
      await stored;
    });
    expect(toggle().checked).toBe(true);
    await act(async () => {
      toggle().click();
      await Promise.resolve();
    });
    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(toggle().checked).toBe(false);
  });
});
