import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import { OVERLAY_STATE } from '../background/messages';

import { reportOverlayState } from './overlay-state-report';

describe('reportOverlayState', () => {
  it('tells the worker the overlay is now mounted', () => {
    const send = vi.fn(() => Promise.resolve());
    reportOverlayState(true, send);
    expect(send).toHaveBeenCalledWith({ type: OVERLAY_STATE, mounted: true });
  });

  it('tells the worker the overlay is now closed', () => {
    const send = vi.fn(() => Promise.resolve());
    reportOverlayState(false, send);
    expect(send).toHaveBeenCalledWith({ type: OVERLAY_STATE, mounted: false });
  });

  it('swallows a send that throws synchronously, so the overlay still works', () => {
    const send = vi.fn(() => {
      throw new Error('receiving end does not exist');
    });
    expect(() => {
      reportOverlayState(true, send);
    }).not.toThrow();
  });

  it('swallows a send that rejects, so an unhandled rejection cannot surface in the page', async () => {
    const send = vi.fn(() => Promise.reject(new Error('receiving end does not exist')));
    expect(() => {
      reportOverlayState(true, send);
    }).not.toThrow();
    // Let the rejected promise settle; an unswallowed rejection would surface here.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
