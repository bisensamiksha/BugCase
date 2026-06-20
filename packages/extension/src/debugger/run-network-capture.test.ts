import { describe, expect, it, vi } from 'vitest';

// Transitively imports lib/browser (config); stub the polyfill for node.
// Every test injects fakes, so the real browser APIs are never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { SettingsStorageArea } from './config';
import type { Debuggee, DebuggerApi, DebuggerEventListener } from './debugger-session';
import { DEFAULT_DEBUGGER_DRAIN_MS, runDebuggerNetworkCapture } from './run-network-capture';

function makeFakeApi(bodies: Record<string, { body: string; base64Encoded: boolean }>): {
  api: DebuggerApi;
  emit: (source: Debuggee, method: string, params?: unknown) => void;
} {
  let listener: DebuggerEventListener | undefined;
  const api: DebuggerApi = {
    attach: async () => {},
    detach: async () => {},
    sendCommand: (_target, method, params) => {
      if (method === 'Network.getResponseBody') {
        const id = (params as { requestId: string }).requestId;
        return Promise.resolve(bodies[id] ?? { body: '', base64Encoded: false });
      }
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
  };
  return { api, emit: (source, method, params) => listener?.(source, method, params) };
}

/** Storage area that returns the given debugger-capture settings. */
const settingsStorage = (settings: {
  enabled?: boolean;
  maxBodyBytes?: number;
}): SettingsStorageArea => ({
  get: () => Promise.resolve({ 'bugcase/debugger-capture-settings': settings }),
  set: () => Promise.resolve(),
});

const enabled = settingsStorage({ enabled: true });

describe('runDebuggerNetworkCapture', () => {
  it('returns ok:false with a reason when the debugger api is unavailable', async () => {
    const result = await runDebuggerNetworkCapture({ tabId: 1 }, { storage: enabled });
    expect(result.ok).toBe(false);
    expect(result.bodies).toEqual([]);
    expect(result.reason).toMatch(/debugger|unavailable|chromium/i);
  });

  it('returns ok:false when the opt-in is disabled', async () => {
    const { api } = makeFakeApi({});
    const result = await runDebuggerNetworkCapture(
      { tabId: 1 },
      { debuggerApi: api, storage: settingsStorage({ enabled: false }) },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/disabled/i);
  });

  it('captures response bodies on the happy path and toggles the banner', async () => {
    const { api, emit } = makeFakeApi({ '1': { body: 'payload', base64Encoded: false } });
    const onActiveChange = vi.fn();
    const result = await runDebuggerNetworkCapture(
      { tabId: 42, drainMs: 0 },
      {
        debuggerApi: api,
        storage: enabled,
        onActiveChange,
        // The drain window is where traffic is observed; emit during it, then resolve.
        wait: () => {
          emit({ tabId: 42 }, 'Network.responseReceived', {
            requestId: '1',
            response: { url: 'https://x/a', mimeType: 'text/plain' },
          });
          emit({ tabId: 42 }, 'Network.loadingFinished', { requestId: '1' });
          return Promise.resolve();
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(result.bodies.map((b) => b.requestId)).toEqual(['1']);
    expect(result.bodies[0]?.text).toBe('payload');
    expect(onActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it('honours the configured body-size cap from storage', async () => {
    const { api, emit } = makeFakeApi({ '1': { body: 'abcdefghij', base64Encoded: false } });
    const result = await runDebuggerNetworkCapture(
      { tabId: 1, drainMs: 0 },
      {
        debuggerApi: api,
        storage: settingsStorage({ enabled: true, maxBodyBytes: 4 }),
        wait: () => {
          emit({ tabId: 1 }, 'Network.responseReceived', {
            requestId: '1',
            response: { url: 'https://x/a', mimeType: 'text/plain' },
          });
          emit({ tabId: 1 }, 'Network.loadingFinished', { requestId: '1' });
          return Promise.resolve();
        },
      },
    );
    expect(result.bodies[0]).toMatchObject({ text: 'abcd', truncated: true, sizeBytes: 10 });
  });

  it('never throws — a failed attach resolves to ok:false', async () => {
    const { api } = makeFakeApi({});
    const failing: DebuggerApi = {
      ...api,
      attach: () => Promise.reject(new Error('Cannot attach to this target')),
    };
    const result = await runDebuggerNetworkCapture(
      { tabId: 1, drainMs: 0 },
      { debuggerApi: failing, storage: enabled, wait: async () => {} },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/attach/i);
  });

  it('defaults the drain window to ~500ms', () => {
    expect(DEFAULT_DEBUGGER_DRAIN_MS).toBe(500);
  });
});
