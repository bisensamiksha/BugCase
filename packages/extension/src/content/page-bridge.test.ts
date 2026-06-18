import { afterEach, describe, expect, it, vi } from 'vitest';

import { installPageBridgeClient } from '../injected/page-bridge-client';
import {
  createFlushResponse,
  createVerifierToken,
  isFlushRequest,
  type BridgeFlushRequest,
} from '../shared/bridge-protocol';
import type { BridgeMessageEvent, BridgeWindow } from '../shared/bridge-window';

import { createPageBridge } from './page-bridge';

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

afterEach(() => {
  vi.useRealTimers();
});

describe('createPageBridge ↔ installPageBridgeClient round-trip', () => {
  it('flushes the registered channel and resolves with its entries', async () => {
    const { win } = createFakePage();
    const client = installPageBridgeClient(win);
    client.registerFlushProvider('console', () => [{ message: 'logged' }]);
    const bridge = createPageBridge(win);

    await expect(bridge.flush('console')).resolves.toEqual([{ message: 'logged' }]);
  });

  it('routes by channel — a console flush does not return network entries', async () => {
    const { win } = createFakePage();
    const client = installPageBridgeClient(win);
    client.registerFlushProvider('console', () => ['c']);
    client.registerFlushProvider('network', () => ['n']);
    const bridge = createPageBridge(win);

    await expect(bridge.flush('network')).resolves.toEqual(['n']);
  });
});

describe('createPageBridge', () => {
  it('resolves empty (never hangs) when no MAIN-world responder exists', async () => {
    vi.useFakeTimers();
    const { win } = createFakePage();
    const bridge = createPageBridge(win, { timeoutMs: 500 });

    const pending = bridge.flush('console');
    await vi.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toEqual([]);
  });

  it('ignores a response carrying the wrong verifier token', async () => {
    vi.useFakeTimers();
    const { win, dispatch } = createFakePage();
    let captured: BridgeFlushRequest | undefined;
    win.addEventListener('message', (event) => {
      if (isFlushRequest(event.data)) captured = event.data;
    });
    const bridge = createPageBridge(win, { timeoutMs: 500 });

    const pending = bridge.flush('console');
    // Reply with a forged token for the right correlation id.
    const forged = createFlushResponse({ ...(captured as BridgeFlushRequest), token: 'wrong' }, [
      'x',
    ]);
    dispatch({ data: forged, source: win, origin: 'http://localhost' });
    await vi.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toEqual([]); // forged reply ignored → falls through to timeout
  });

  it('removes its listener on dispose', async () => {
    vi.useFakeTimers();
    const { win } = createFakePage();
    const bridge = createPageBridge(win, { timeoutMs: 100 });
    bridge.dispose();
    const client = installPageBridgeClient(win);
    client.registerFlushProvider('console', () => ['late']);

    // After dispose the bridge no longer listens, so even a valid responder cannot resolve entries.
    const pending = bridge.flush('console');
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toEqual([]);
  });

  it('exposes a non-empty per-instance token', () => {
    const { win } = createFakePage();
    const a = createPageBridge(win);
    const b = createPageBridge(win);
    expect(a.token).toMatch(/\S/);
    expect(a.token).not.toBe(b.token);
    expect(createVerifierToken()).toMatch(/\S/);
  });
});
