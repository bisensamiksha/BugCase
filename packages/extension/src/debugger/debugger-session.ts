/**
 * On-demand `chrome.debugger` session lifecycle (S2-10).
 *
 * `withDebuggerSession` attaches the debugger to a tab, enables the CDP domains we read from
 * (Network/Console/Runtime/Log), runs a capture callback, and **always detaches in a `finally`** —
 * including on denial or failure — so a tab is never left with a dangling debugger banner. A user
 * banner is toggled via `onActiveChange` for the whole attached window.
 *
 * The `chrome.debugger` API is Chromium-only (Firefox has no equivalent), so it is reached through
 * an injectable {@link DebuggerApi} that defaults to the global binding and is faked in tests.
 */

/** A debuggee target. We only ever attach by tab id. */
export interface Debuggee {
  readonly tabId: number;
}

/** `chrome.debugger.onEvent` listener shape: `(source, method, params)`. */
export type DebuggerEventListener = (source: Debuggee, method: string, params?: unknown) => void;

/** The slice of `chrome.debugger` we depend on (promise-style; modern Chromium MV3 returns promises). */
export interface DebuggerApi {
  attach(target: Debuggee, requiredVersion: string): Promise<void>;
  detach(target: Debuggee): Promise<void>;
  sendCommand(target: Debuggee, method: string, commandParams?: object): Promise<unknown>;
  readonly onEvent: {
    addListener(callback: DebuggerEventListener): void;
    removeListener(callback: DebuggerEventListener): void;
  };
}

/** Handle passed to the capture callback for the duration of an attached session. */
export interface DebuggerSession {
  readonly target: Debuggee;
  /** Approximate window (ms) the caller should drain CDP events for. */
  readonly drainMs: number;
  /** Send a CDP command scoped to this session's target. */
  sendCommand(method: string, params?: object): Promise<unknown>;
  /** Subscribe to a CDP event for this target; returns an unsubscribe function. */
  on(method: string, handler: (params: unknown) => void): () => void;
}

/** CDP protocol version requested on attach. */
export const CDP_PROTOCOL_VERSION = '1.3';

/** CDP domains enabled for the capture window. */
export const ENABLED_CDP_DOMAINS = ['Network', 'Console', 'Runtime', 'Log'] as const;

export interface DebuggerSessionOptions {
  readonly tabId: number;
  /** Approximate time to keep the session open draining events. */
  readonly drainMs: number;
}

export interface DebuggerSessionDeps {
  /** Defaults to the global `chrome.debugger`; injected in tests. */
  readonly debuggerApi?: DebuggerApi;
  /** Toggle the user-facing debugger banner: `true` before attach, `false` after detach. */
  readonly onActiveChange?: (active: boolean) => void;
}

function globalDebuggerApi(): DebuggerApi | undefined {
  return (globalThis as { chrome?: { debugger?: DebuggerApi } }).chrome?.debugger;
}

/** Whether a `chrome.debugger` binding is reachable (false on Firefox and in node tests). */
export function isDebuggerApiAvailable(deps: DebuggerSessionDeps = {}): boolean {
  return Boolean(deps.debuggerApi ?? globalDebuggerApi());
}

/**
 * Attach the debugger, enable the required CDP domains, run `run(session)`, and detach in `finally`.
 * Rethrows whatever `run` throws (after detaching); detach failures are swallowed so they cannot
 * mask the real result. Throws synchronously if no debugger api is available.
 */
export async function withDebuggerSession<T>(
  options: DebuggerSessionOptions,
  run: (session: DebuggerSession) => Promise<T>,
  deps: DebuggerSessionDeps = {},
): Promise<T> {
  const api = deps.debuggerApi ?? globalDebuggerApi();
  if (!api) {
    throw new Error('chrome.debugger is unavailable in this browser');
  }
  const target: Debuggee = { tabId: options.tabId };
  const handlers = new Map<string, Set<(params: unknown) => void>>();
  const rootListener: DebuggerEventListener = (source, method, params) => {
    if (source.tabId !== target.tabId) {
      return;
    }
    for (const handler of handlers.get(method) ?? []) {
      handler(params);
    }
  };

  const session: DebuggerSession = {
    target,
    drainMs: options.drainMs,
    sendCommand: (method, params) => api.sendCommand(target, method, params),
    on: (method, handler) => {
      const set = handlers.get(method) ?? new Set();
      set.add(handler);
      handlers.set(method, set);
      return () => set.delete(handler);
    },
  };

  deps.onActiveChange?.(true);
  try {
    api.onEvent.addListener(rootListener);
    await api.attach(target, CDP_PROTOCOL_VERSION);
    for (const domain of ENABLED_CDP_DOMAINS) {
      await api.sendCommand(target, `${domain}.enable`);
    }
    return await run(session);
  } finally {
    api.onEvent.removeListener(rootListener);
    try {
      await api.detach(target);
    } catch {
      // Detaching a never-attached or already-gone target is fine; never mask the result.
    }
    deps.onActiveChange?.(false);
  }
}
