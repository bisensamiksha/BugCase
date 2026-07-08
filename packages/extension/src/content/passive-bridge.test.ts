// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import { PASSIVE_ERROR, type PassiveErrorRequest } from '../background/messages';
import { createPassiveError } from '../shared/bridge-protocol';

import {
  PASSIVE_BRIDGE_INSTALLED_FLAG,
  installPassiveBridge,
  installPassiveErrorRelay,
} from './passive-bridge';

describe('installPassiveBridge', () => {
  beforeEach(() => {
    // The module self-invokes on import (it ships as an injected IIFE), so reset the guard flag.
    delete (window as unknown as Record<string, unknown>)[PASSIVE_BRIDGE_INSTALLED_FLAG];
  });

  it('installs once and marks the isolated-world flag', () => {
    expect(installPassiveBridge(window)).toBe(true);
    expect((window as unknown as Record<string, unknown>)[PASSIVE_BRIDGE_INSTALLED_FLAG]).toBe(
      true,
    );
  });

  it('is idempotent — a second install on the same window is a no-op', () => {
    expect(installPassiveBridge(window)).toBe(true);
    expect(installPassiveBridge(window)).toBe(false);
  });

  it('does not throw when invoked', () => {
    expect(() => installPassiveBridge(window)).not.toThrow();
  });
});

describe('installPassiveErrorRelay', () => {
  it('relays a passive-error signal to the runtime send', () => {
    const sent: PassiveErrorRequest[] = [];
    const stop = installPassiveErrorRelay(window, (m) => sent.push(m));
    window.dispatchEvent(new MessageEvent('message', { data: createPassiveError() }));
    expect(sent).toEqual([{ type: PASSIVE_ERROR }]);
    stop();
  });

  it('ignores messages that are not passive-error signals', () => {
    const sent: PassiveErrorRequest[] = [];
    const stop = installPassiveErrorRelay(window, (m) => sent.push(m));
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'other', kind: 'x' } }));
    window.dispatchEvent(new MessageEvent('message', { data: 'nope' }));
    expect(sent).toEqual([]);
    stop();
  });

  it('stops relaying after the disposer runs', () => {
    const sent: PassiveErrorRequest[] = [];
    const stop = installPassiveErrorRelay(window, (m) => sent.push(m));
    stop();
    window.dispatchEvent(new MessageEvent('message', { data: createPassiveError() }));
    expect(sent).toEqual([]);
  });
});
