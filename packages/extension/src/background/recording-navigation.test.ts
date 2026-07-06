import { describe, expect, it, vi } from 'vitest';

import type { RecordingSession } from '../storage/recording-session';

import { createRecordingNavigationHandler } from './recording-navigation';

const recording: RecordingSession = {
  status: 'recording',
  startedAt: '2026-07-05T10:00:00.000Z',
  endedAt: null,
  url: 'https://a.test/page1',
  steps: [],
};

describe('createRecordingNavigationHandler', () => {
  it('re-injects the overlay when a recording tab finishes navigating', async () => {
    const reinject = vi.fn(() => Promise.resolve());
    const handler = createRecordingNavigationHandler({
      getRecording: () => Promise.resolve(recording),
      reinject,
    });
    await handler(7, 'complete', 'https://a.test/page2');
    expect(reinject).toHaveBeenCalledWith(7);
  });

  it('does nothing until the navigation is complete', async () => {
    const reinject = vi.fn(() => Promise.resolve());
    const handler = createRecordingNavigationHandler({
      getRecording: () => Promise.resolve(recording),
      reinject,
    });
    await handler(7, 'loading', 'https://a.test/page2');
    expect(reinject).not.toHaveBeenCalled();
  });

  it('does nothing when there is no active recording for the tab', async () => {
    const reinject = vi.fn(() => Promise.resolve());
    const handler = createRecordingNavigationHandler({
      getRecording: () => Promise.resolve(null),
      reinject,
    });
    await handler(7, 'complete', 'https://a.test/page2');
    expect(reinject).not.toHaveBeenCalled();
  });

  it('does nothing when the recording was already stopped', async () => {
    const reinject = vi.fn(() => Promise.resolve());
    const handler = createRecordingNavigationHandler({
      getRecording: () => Promise.resolve({ ...recording, status: 'stopped' }),
      reinject,
    });
    await handler(7, 'complete', 'https://a.test/page2');
    expect(reinject).not.toHaveBeenCalled();
  });

  it('ignores non-http(s) navigations', async () => {
    const reinject = vi.fn(() => Promise.resolve());
    const handler = createRecordingNavigationHandler({
      getRecording: () => Promise.resolve(recording),
      reinject,
    });
    await handler(7, 'complete', 'chrome://extensions');
    expect(reinject).not.toHaveBeenCalled();
  });
});
