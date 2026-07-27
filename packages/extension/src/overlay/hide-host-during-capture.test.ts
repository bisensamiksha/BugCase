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
