import { describe, expect, it } from 'vitest';

import { createFlushRequest, isFlushResponse } from '../shared/bridge-protocol';
import type { BridgeMessageEvent, BridgeWindow } from '../shared/bridge-window';

import { installPageBridgeClient } from './page-bridge-client';

/** A single-window page where postMessage synchronously dispatches to every listener. */
function createFakePage() {
  const listeners = new Set<(event: BridgeMessageEvent) => void>();
  const win: BridgeWindow = {
    postMessage(data: unknown) {
      dispatch({ data, source: win, origin: 'http://localhost' });
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
  };
  function dispatch(event: BridgeMessageEvent) {
    for (const listener of [...listeners]) listener(event);
  }
  return { win, dispatch };
}

/** Capture flush-response messages posted back on the window. */
function captureResponses(win: BridgeWindow): unknown[] {
  const responses: unknown[] = [];
  win.addEventListener('message', (event) => {
    if (isFlushResponse(event.data)) responses.push(event.data);
  });
  return responses;
}

describe('installPageBridgeClient', () => {
  it('answers a valid flush-request with the registered provider entries', () => {
    const { win } = createFakePage();
    const responses = captureResponses(win);
    const client = installPageBridgeClient(win);
    client.registerFlushProvider('console', () => [{ level: 'log', message: 'hi' }]);

    win.postMessage(createFlushRequest('console', 'tok'), '*');

    expect(responses).toEqual([
      expect.objectContaining({
        kind: 'flush-response',
        channel: 'console',
        token: 'tok',
        entries: [{ level: 'log', message: 'hi' }],
      }),
    ]);
  });

  it('answers with no entries when nothing is registered for the channel', () => {
    const { win } = createFakePage();
    const responses = captureResponses(win);
    installPageBridgeClient(win);

    win.postMessage(createFlushRequest('network', 'tok'), '*');

    expect(responses).toEqual([expect.objectContaining({ channel: 'network', entries: [] })]);
  });

  it('does not throw and yields no entries when a provider throws', () => {
    const { win } = createFakePage();
    const responses = captureResponses(win);
    const client = installPageBridgeClient(win);
    client.registerFlushProvider('console', () => {
      throw new Error('provider boom');
    });

    expect(() => win.postMessage(createFlushRequest('console', 'tok'), '*')).not.toThrow();
    expect(responses).toEqual([expect.objectContaining({ entries: [] })]);
  });

  it('pins the first token and ignores later requests bearing a different token (anti-spoof)', () => {
    const { win } = createFakePage();
    const responses = captureResponses(win);
    installPageBridgeClient(win);

    win.postMessage(createFlushRequest('console', 'legit'), '*');
    win.postMessage(createFlushRequest('console', 'spoofed'), '*');

    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ token: 'legit' });
  });

  it('ignores events whose source is not this window', () => {
    const { win, dispatch } = createFakePage();
    const responses = captureResponses(win);
    installPageBridgeClient(win);

    dispatch({
      data: createFlushRequest('console', 'tok'),
      source: {},
      origin: 'http://evil.test',
    });

    expect(responses).toHaveLength(0);
  });

  it('stops responding after dispose', () => {
    const { win } = createFakePage();
    const responses = captureResponses(win);
    const client = installPageBridgeClient(win);
    client.dispose();

    win.postMessage(createFlushRequest('console', 'tok'), '*');

    expect(responses).toHaveLength(0);
  });
});
