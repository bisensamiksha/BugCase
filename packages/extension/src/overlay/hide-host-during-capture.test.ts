// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OVERLAY_HOST_ID } from '../shared/overlay-host';

import { withHostHidden } from './hide-host-during-capture';

function mountHost(initialVisibility = 'visible'): HTMLElement {
  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  host.style.visibility = initialVisibility;
  document.body.appendChild(host);
  return host;
}

beforeEach(() => {
  // Run rAF synchronously so the double-rAF wait resolves deterministically.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  document.getElementById(OVERLAY_HOST_ID)?.remove();
  vi.unstubAllGlobals();
});

describe('withHostHidden', () => {
  it('hides the overlay host while the capture runs and restores it after', async () => {
    const host = mountHost('visible');
    let visibleDuringCapture = '';
    const result = await withHostHidden(() => {
      visibleDuringCapture = host.style.visibility;
      return Promise.resolve('shot');
    });
    expect(visibleDuringCapture).toBe('hidden');
    expect(host.style.visibility).toBe('visible');
    expect(result).toBe('shot');
  });

  it('restores the host even if the capture throws', async () => {
    const host = mountHost('visible');
    await expect(withHostHidden(() => Promise.reject(new Error('capture failed')))).rejects.toThrow(
      'capture failed',
    );
    expect(host.style.visibility).toBe('visible');
  });

  it('runs the capture unchanged when no overlay host is mounted', async () => {
    const result = await withHostHidden(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});

describe('withHostHidden — skipIfClearOf (BUG-04: stop the picker pill flickering)', () => {
  /** Give the mounted host a real bounding box in jsdom. */
  function boxHost(
    host: HTMLElement,
    rect: { x: number; y: number; width: number; height: number },
  ) {
    host.getBoundingClientRect = () => ({
      x: rect.x,
      y: rect.y,
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({}),
    });
  }

  it('does NOT hide the host when it sits clear of the cropped element', async () => {
    const host = mountHost('visible');
    boxHost(host, { x: 400, y: 400, width: 180, height: 60 });
    let visibilityDuring = '';
    await withHostHidden(
      () => {
        visibilityDuring = host.style.visibility;
        return Promise.resolve('shot');
      },
      document,
      { skipIfClearOf: { x: 0, y: 0, width: 100, height: 100 } },
    );
    expect(visibilityDuring).toBe('visible');
    expect(host.style.visibility).toBe('visible');
  });

  it('still hides the host when it overlaps the cropped element', async () => {
    const host = mountHost('visible');
    boxHost(host, { x: 50, y: 50, width: 180, height: 60 });
    let visibilityDuring = '';
    await withHostHidden(
      () => {
        visibilityDuring = host.style.visibility;
        return Promise.resolve('shot');
      },
      document,
      { skipIfClearOf: { x: 0, y: 0, width: 100, height: 100 } },
    );
    expect(visibilityDuring).toBe('hidden');
    expect(host.style.visibility).toBe('visible');
  });

  it('hides unconditionally when no crop rect is supplied (full-viewport capture)', async () => {
    const host = mountHost('visible');
    boxHost(host, { x: 400, y: 400, width: 180, height: 60 });
    let visibilityDuring = '';
    await withHostHidden(() => {
      visibilityDuring = host.style.visibility;
      return Promise.resolve('shot');
    });
    expect(visibilityDuring).toBe('hidden');
  });
});
