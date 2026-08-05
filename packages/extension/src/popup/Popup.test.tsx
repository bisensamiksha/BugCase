// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const { getManifest, sendMessage } = vi.hoisted(() => ({
  getManifest: vi.fn(() => ({ name: 'BugCase - Bug Reporter Tool', version: '0.0.1' })),
  sendMessage: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('webextension-polyfill', () => ({
  default: { runtime: { getManifest, sendMessage } },
}));

import { OVERLAY_INJECT } from '../background/messages';

import { Popup } from './Popup';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let closeSpy: MockInstance;

beforeEach(() => {
  sendMessage.mockClear();
  // The popup closes itself when opening the overlay; stub it so a real jsdom window.close() (which
  // would tear down the test environment) never runs.
  closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  closeSpy.mockRestore();
});

describe('Popup', () => {
  it('asks the service worker to inject the overlay when the button is clicked', () => {
    act(() => {
      root.render(<Popup />);
    });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="open-overlay"]');
    expect(button).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sendMessage).toHaveBeenCalledWith({ type: OVERLAY_INJECT });
  });

  it('closes the toolbar popup after opening the overlay so it does not overlap (BUG-03)', () => {
    act(() => {
      root.render(<Popup />);
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="open-overlay"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sendMessage).toHaveBeenCalledWith({ type: OVERLAY_INJECT });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
