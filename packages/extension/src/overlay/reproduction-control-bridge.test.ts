import { describe, expect, it, vi } from 'vitest';

import { BUGCASE_BRIDGE_SOURCE } from '../shared/bridge-protocol';

import { sendRecorderControl } from './reproduction-control-bridge';

describe('sendRecorderControl', () => {
  it('posts a tagged recorder-control message to the page window', () => {
    const postMessage = vi.fn();
    sendRecorderControl({ postMessage }, 'start', 'tok');
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: BUGCASE_BRIDGE_SOURCE,
        kind: 'recorder-control',
        action: 'start',
        token: 'tok',
      },
      '*',
    );
  });

  it('relays the stop action', () => {
    const postMessage = vi.fn();
    sendRecorderControl({ postMessage }, 'stop', 'tok');
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({ action: 'stop' });
  });

  it('never throws when there is no window', () => {
    expect(() => sendRecorderControl(undefined, 'start', 'tok')).not.toThrow();
  });
});
