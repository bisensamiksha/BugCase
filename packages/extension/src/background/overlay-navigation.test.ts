import { describe, expect, it, vi } from 'vitest';

import { createOverlayNavigationHandler } from './overlay-navigation';

/** Handler wired to an open overlay and no active recording, unless overridden. */
function makeHandler(
  overrides: {
    isOverlayOpen?: (tabId: number) => Promise<boolean>;
    isRecording?: (tabId: number) => Promise<boolean>;
  } = {},
) {
  const reinject = vi.fn(() => Promise.resolve());
  const handler = createOverlayNavigationHandler({
    isOverlayOpen: overrides.isOverlayOpen ?? (() => Promise.resolve(true)),
    isRecording: overrides.isRecording ?? (() => Promise.resolve(false)),
    reinject,
  });
  return { handler, reinject };
}

describe('createOverlayNavigationHandler', () => {
  it('re-mounts the overlay when a tab with an open overlay finishes navigating', async () => {
    const { handler, reinject } = makeHandler();
    await handler(7, 'complete', 'https://a.test/page2');
    expect(reinject).toHaveBeenCalledWith(7);
  });

  it('does nothing when the overlay is not open in that tab', async () => {
    const { handler, reinject } = makeHandler({ isOverlayOpen: () => Promise.resolve(false) });
    await handler(7, 'complete', 'https://a.test/page2');
    expect(reinject).not.toHaveBeenCalled();
  });

  it('does nothing until the navigation is complete', async () => {
    const { handler, reinject } = makeHandler();
    await handler(7, 'loading', 'https://a.test/page2');
    expect(reinject).not.toHaveBeenCalled();
  });

  it('ignores non-http(s) navigations', async () => {
    const { handler, reinject } = makeHandler();
    await handler(7, 'complete', 'chrome://extensions');
    expect(reinject).not.toHaveBeenCalled();
  });

  it('ignores a navigation with no url', async () => {
    const { handler, reinject } = makeHandler();
    await handler(7, 'complete', undefined);
    expect(reinject).not.toHaveBeenCalled();
  });

  it('defers to the recording handler when a recording is active, so the tab is injected once', async () => {
    const { handler, reinject } = makeHandler({ isRecording: () => Promise.resolve(true) });
    await handler(7, 'complete', 'https://a.test/page2');
    expect(reinject).not.toHaveBeenCalled();
  });
});
