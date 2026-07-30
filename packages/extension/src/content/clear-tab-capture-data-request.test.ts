import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import { CLEAR_TAB_CAPTURE_DATA } from '../background/clear-tab-capture-data-handler';

import { requestClearTabCaptureData } from './clear-tab-capture-data-request';

describe('requestClearTabCaptureData', () => {
  it('asks the worker to wipe this tab’s captured data', () => {
    const send = vi.fn(() => Promise.resolve({ ok: true }));
    requestClearTabCaptureData(send);
    expect(send).toHaveBeenCalledWith({ type: CLEAR_TAB_CAPTURE_DATA });
  });

  it('swallows a send that throws synchronously, so closing the overlay still works', () => {
    const send = vi.fn(() => {
      throw new Error('receiving end does not exist');
    });
    expect(() => {
      requestClearTabCaptureData(send);
    }).not.toThrow();
  });

  it('swallows a send that rejects, so an unhandled rejection cannot surface in the page', async () => {
    const send = vi.fn(() => Promise.reject(new Error('receiving end does not exist')));
    expect(() => {
      requestClearTabCaptureData(send);
    }).not.toThrow();
    // Let the rejected promise settle; an unswallowed rejection would surface here.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
