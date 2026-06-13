// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OVERLAY_HOST_ID,
  isOverlayMounted,
  mountOverlay,
  removeOverlay,
  toggleOverlay,
} from './overlay-root';

// React 18 needs this flag so act() flushes renders during tests.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => {
    removeOverlay(document);
  });
});

describe('mountOverlay', () => {
  it('mounts the overlay app inside an open ShadowRoot on the document', () => {
    act(() => {
      mountOverlay(document);
    });

    const host = document.getElementById(OVERLAY_HOST_ID);
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).toBeInstanceOf(ShadowRoot);
    // The app renders into the shadow root — isolated from the page's light DOM.
    expect(host?.shadowRoot?.querySelector('[data-testid="bugcase-overlay"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="bugcase-overlay"]')).toBeNull();
    expect(isOverlayMounted(document)).toBe(true);
  });

  it('is idempotent — a second mount does not create a second host', () => {
    act(() => {
      mountOverlay(document);
    });
    act(() => {
      mountOverlay(document);
    });
    expect(document.querySelectorAll(`#${OVERLAY_HOST_ID}`)).toHaveLength(1);
  });
});

describe('removeOverlay', () => {
  it('removes the host cleanly and reports that it removed something', () => {
    act(() => {
      mountOverlay(document);
    });
    let removed = false;
    act(() => {
      removed = removeOverlay(document);
    });
    expect(removed).toBe(true);
    expect(document.getElementById(OVERLAY_HOST_ID)).toBeNull();
    expect(isOverlayMounted(document)).toBe(false);
  });

  it('returns false when there is nothing to remove', () => {
    let removed = true;
    act(() => {
      removed = removeOverlay(document);
    });
    expect(removed).toBe(false);
  });
});

describe('toggleOverlay', () => {
  it('mounts when absent and removes when present', () => {
    act(() => {
      toggleOverlay(document);
    });
    expect(isOverlayMounted(document)).toBe(true);
    act(() => {
      toggleOverlay(document);
    });
    expect(isOverlayMounted(document)).toBe(false);
  });
});

describe('OverlayApp close affordance', () => {
  it('removes the overlay when the close button is clicked', () => {
    act(() => {
      mountOverlay(document);
    });
    const closeButton = document
      .getElementById(OVERLAY_HOST_ID)
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="bugcase-overlay-close"]');
    expect(closeButton).not.toBeNull();
    act(() => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(isOverlayMounted(document)).toBe(false);
  });
});
