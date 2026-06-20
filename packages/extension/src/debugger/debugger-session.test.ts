import { describe, expect, it, vi } from 'vitest';

import {
  CDP_PROTOCOL_VERSION,
  ENABLED_CDP_DOMAINS,
  type Debuggee,
  type DebuggerApi,
  type DebuggerEventListener,
  isDebuggerApiAvailable,
  withDebuggerSession,
} from './debugger-session';

interface FakeApi {
  readonly api: DebuggerApi;
  readonly attach: { target: Debuggee; version: string }[];
  readonly detach: Debuggee[];
  readonly commands: { method: string; params?: object }[];
  emit(source: Debuggee, method: string, params?: unknown): void;
  hasListener(): boolean;
}

function makeFakeApi(overrides: Partial<DebuggerApi> = {}): FakeApi {
  const attach: { target: Debuggee; version: string }[] = [];
  const detach: Debuggee[] = [];
  const commands: { method: string; params?: object }[] = [];
  let listener: DebuggerEventListener | undefined;
  const api: DebuggerApi = {
    attach: (target, version) => {
      attach.push({ target, version });
      return Promise.resolve();
    },
    detach: (target) => {
      detach.push(target);
      return Promise.resolve();
    },
    sendCommand: (_target, method, params) => {
      commands.push({ method, ...(params ? { params } : {}) });
      return Promise.resolve({});
    },
    onEvent: {
      addListener: (cb) => {
        listener = cb;
      },
      removeListener: () => {
        listener = undefined;
      },
    },
    ...overrides,
  };
  return {
    api,
    attach,
    detach,
    commands,
    emit: (source, method, params) => listener?.(source, method, params),
    hasListener: () => listener !== undefined,
  };
}

describe('withDebuggerSession', () => {
  it('attaches with the protocol version and enables the required CDP domains in order', async () => {
    const fake = makeFakeApi();
    await withDebuggerSession({ tabId: 7, drainMs: 0 }, () => Promise.resolve('done'), {
      debuggerApi: fake.api,
    });
    expect(fake.attach).toEqual([{ target: { tabId: 7 }, version: CDP_PROTOCOL_VERSION }]);
    expect(fake.commands.map((c) => c.method)).toEqual(
      ENABLED_CDP_DOMAINS.map((d) => `${d}.enable`),
    );
  });

  it('returns the run result and always detaches in finally', async () => {
    const fake = makeFakeApi();
    const result = await withDebuggerSession({ tabId: 1, drainMs: 0 }, () => Promise.resolve(42), {
      debuggerApi: fake.api,
    });
    expect(result).toBe(42);
    expect(fake.detach).toEqual([{ tabId: 1 }]);
  });

  it('detaches and rethrows when the run callback throws', async () => {
    const fake = makeFakeApi();
    await expect(
      withDebuggerSession({ tabId: 2, drainMs: 0 }, () => Promise.reject(new Error('boom')), {
        debuggerApi: fake.api,
      }),
    ).rejects.toThrow('boom');
    expect(fake.detach).toEqual([{ tabId: 2 }]);
  });

  it('swallows a detach failure so it never masks the result', async () => {
    const fake = makeFakeApi({
      detach: () => Promise.reject(new Error('already detached')),
    });
    await expect(
      withDebuggerSession({ tabId: 3, drainMs: 0 }, () => Promise.resolve('ok'), {
        debuggerApi: fake.api,
      }),
    ).resolves.toBe('ok');
  });

  it('toggles the active banner on then off, even when run throws', async () => {
    const fake = makeFakeApi();
    const active = vi.fn();
    await withDebuggerSession({ tabId: 4, drainMs: 0 }, () => Promise.resolve('ok'), {
      debuggerApi: fake.api,
      onActiveChange: active,
    });
    expect(active.mock.calls).toEqual([[true], [false]]);

    const active2 = vi.fn();
    await expect(
      withDebuggerSession({ tabId: 4, drainMs: 0 }, () => Promise.reject(new Error('x')), {
        debuggerApi: fake.api,
        onActiveChange: active2,
      }),
    ).rejects.toThrow();
    expect(active2.mock.calls).toEqual([[true], [false]]);
  });

  it('removes its event listener once the session ends', async () => {
    const fake = makeFakeApi();
    await withDebuggerSession({ tabId: 5, drainMs: 0 }, () => Promise.resolve(undefined), {
      debuggerApi: fake.api,
    });
    expect(fake.hasListener()).toBe(false);
  });

  it('routes matching CDP events to subscribers and stops on unsubscribe', async () => {
    const fake = makeFakeApi();
    const received: unknown[] = [];
    await withDebuggerSession(
      { tabId: 9, drainMs: 0 },
      (session) => {
        const off = session.on('Network.responseReceived', (params) => received.push(params));
        fake.emit({ tabId: 9 }, 'Network.responseReceived', { requestId: 'a' });
        fake.emit({ tabId: 9 }, 'Network.loadingFinished', { requestId: 'a' }); // different method, ignored
        fake.emit({ tabId: 999 }, 'Network.responseReceived', { requestId: 'b' }); // other tab, ignored
        off();
        fake.emit({ tabId: 9 }, 'Network.responseReceived', { requestId: 'c' }); // after off, ignored
        return Promise.resolve();
      },
      { debuggerApi: fake.api },
    );
    expect(received).toEqual([{ requestId: 'a' }]);
  });

  it('forwards session.sendCommand to the api with the session target', async () => {
    const fake = makeFakeApi();
    await withDebuggerSession(
      { tabId: 11, drainMs: 0 },
      async (session) => {
        await session.sendCommand('Network.getResponseBody', { requestId: 'r1' });
      },
      { debuggerApi: fake.api },
    );
    expect(fake.commands).toContainEqual({
      method: 'Network.getResponseBody',
      params: { requestId: 'r1' },
    });
  });

  it('exposes drainMs on the session', async () => {
    const fake = makeFakeApi();
    let seen = -1;
    await withDebuggerSession(
      { tabId: 1, drainMs: 500 },
      (session) => {
        seen = session.drainMs;
        return Promise.resolve();
      },
      { debuggerApi: fake.api },
    );
    expect(seen).toBe(500);
  });
});

describe('isDebuggerApiAvailable', () => {
  it('is true when a debugger api is injected', () => {
    expect(isDebuggerApiAvailable({ debuggerApi: makeFakeApi().api })).toBe(true);
  });

  it('is false when no debugger api exists (e.g. Firefox / node)', () => {
    expect(isDebuggerApiAvailable()).toBe(false);
  });
});
