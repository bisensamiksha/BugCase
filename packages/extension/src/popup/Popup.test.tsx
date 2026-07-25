// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getManifest, sendMessage } = vi.hoisted(() => ({
  getManifest: vi.fn(() => ({ name: 'BugCase — Bug Reporter Tool', version: '0.0.1' })),
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

beforeEach(() => {
  sendMessage.mockClear();
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
});
