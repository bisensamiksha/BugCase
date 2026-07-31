// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// OverlayApp now renders CaptureButton, whose module graph reaches lib/browser; stub the polyfill.
vi.mock('webextension-polyfill', () => ({ default: {} }));

// BUG-05: the worker tracks overlay-open state from these reports; assert them without a real port.
const reportOverlayState = vi.fn<(mounted: boolean) => void>();
const queryOverlayOpen = vi.fn<() => Promise<boolean | null>>(() => Promise.resolve(null));
vi.mock('./overlay-state-report', () => ({
  reportOverlayState: (mounted: boolean) => {
    reportOverlayState(mounted);
  },
  queryOverlayOpen: () => queryOverlayOpen(),
}));

// BUG-06 follow-up: closing the overlay must wipe all captured data for the tab (draft, recording,
// passive errors), not just the draft — otherwise a closed-and-reopened overlay shows a stale
// completed recording ("Track again") instead of a fresh form. Assert the relay without a worker.
const requestClearTabCaptureData = vi.fn<() => void>();
vi.mock('./clear-tab-capture-data-request', () => ({
  requestClearTabCaptureData: () => requestClearTabCaptureData(),
}));

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

  it('reports the resulting state each way so the worker tracks a toggle correctly', () => {
    reportOverlayState.mockClear();
    act(() => {
      toggleOverlay(document);
    });
    expect(reportOverlayState).toHaveBeenLastCalledWith(true);
    act(() => {
      toggleOverlay(document);
    });
    expect(reportOverlayState).toHaveBeenLastCalledWith(false);
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

  it('wipes the tab’s captured data when the overlay is dismissed from the toolbar icon (BUG-06)', () => {
    // The toolbar icon calls toggleOverlay → removeOverlay, which unmounts React directly and never
    // reaches OverlayApp's onClose. Without a wipe here the draft/recording/passive-error data outlives
    // the close, so reopening — even on a *different* site — restores the previous site's severity,
    // notes, raw element crops, and tracked reproduction steps (shown as a stale "Track again").
    act(() => {
      mountOverlay(document);
    });
    requestClearTabCaptureData.mockClear();
    act(() => {
      toggleOverlay(document);
    });
    expect(isOverlayMounted(document)).toBe(false);
    expect(requestClearTabCaptureData).toHaveBeenCalledTimes(1);
  });

  it('does not wipe captured data when there was no overlay to remove', () => {
    requestClearTabCaptureData.mockClear();
    act(() => {
      removeOverlay(document);
    });
    expect(requestClearTabCaptureData).not.toHaveBeenCalled();
  });

  it('reports the overlay as closed so the worker stops re-mounting it after navigations', () => {
    act(() => {
      mountOverlay(document);
    });
    reportOverlayState.mockClear();
    const closeButton = document
      .getElementById(OVERLAY_HOST_ID)
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-testid="bugcase-overlay-close"]');
    act(() => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(reportOverlayState).toHaveBeenCalledWith(false);
  });
});

// BUG-05 follow-up: the back/forward cache restores a whole document verbatim, overlay host and all.
// A page closed on a *different* document is still cached with its own overlay, so on restore the
// page must reconcile itself against the worker's authoritative flag.
describe('back/forward cache restore', () => {
  function firePageshow(persisted: boolean): void {
    const event = new Event('pageshow') as Event & { persisted?: boolean };
    Object.defineProperty(event, 'persisted', { value: persisted });
    window.dispatchEvent(event);
  }

  it('removes a restored overlay the user had already dismissed', async () => {
    act(() => {
      mountOverlay(document);
    });
    expect(isOverlayMounted(document)).toBe(true);
    queryOverlayOpen.mockResolvedValue(false);

    firePageshow(true);
    await act(async () => {
      await Promise.resolve();
    });

    expect(isOverlayMounted(document)).toBe(false);
  });

  it('keeps a restored overlay the user still has open', async () => {
    act(() => {
      mountOverlay(document);
    });
    queryOverlayOpen.mockResolvedValue(true);

    firePageshow(true);
    await act(async () => {
      await Promise.resolve();
    });

    expect(isOverlayMounted(document)).toBe(true);
  });

  it('leaves the page alone when the worker cannot be reached', async () => {
    act(() => {
      mountOverlay(document);
    });
    queryOverlayOpen.mockResolvedValue(null);

    firePageshow(true);
    await act(async () => {
      await Promise.resolve();
    });

    expect(isOverlayMounted(document)).toBe(true);
  });

  it('ignores an ordinary page load, which is not a cache restore', async () => {
    act(() => {
      mountOverlay(document);
    });
    queryOverlayOpen.mockClear();
    queryOverlayOpen.mockResolvedValue(false);

    firePageshow(false);
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryOverlayOpen).not.toHaveBeenCalled();
    expect(isOverlayMounted(document)).toBe(true);
  });
});
