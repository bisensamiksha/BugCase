// MAIN-world console + error capture (S2-06).
//
// Runs in the page's own JS world (installed from injected/main-entry.ts at document_start) so it can
// observe the page's real `console` and global error events. It monkey-patches each standard console
// method and listens for `error` / `unhandledrejection`, recording every call into a fixed-size FIFO
// ring buffer. The isolated content script later pulls the buffer across the cross-world bridge (S2-05)
// when a capture is requested.
//
// Two safety properties matter here:
//   1. The original console behavior is preserved — patches forward to the real method and never throw.
//   2. The buffer never retains references to live page objects. Each argument is run through
//      `safeStringify` (cycle/DOM/error-safe, bounded) and re-parsed, so what we keep is an inert,
//      JSON-safe snapshot taken at log time — immune to later mutation and free of page object graphs.

import { safeStringify } from '@bugcase/schema';

import { RingBuffer } from '../shared/ring-buffer';

/** The standard console methods we patch, in the schema's canonical level order. */
export const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

export type ConsoleLevel = (typeof CONSOLE_LEVELS)[number];

/** Default cap on retained entries — the locked plan's 500-entry FIFO. */
export const DEFAULT_CONSOLE_BUFFER_SIZE = 500;

/** A single buffered record: a console call, a window error, or an unhandled promise rejection. */
export interface ConsoleBufferEntry {
  readonly type: 'console' | 'error' | 'unhandledrejection';
  /** Present only for `type: 'console'` — which console method was called. */
  readonly level?: ConsoleLevel;
  /** Serialized, inert copies of the call arguments (no live page references). */
  readonly args: readonly unknown[];
  /** Capture time in epoch ms. */
  readonly timestamp: number;
}

/**
 * The slice of a window the buffer needs: its `console` and the error event target. Narrowed to an
 * interface (rather than `Window`) so it is trivially faked in tests and works in any host context.
 * Methods are typed as present for the standard levels but may be absent at runtime (some embedded
 * webviews omit `console.trace`, etc.), so the installer guards each one before patching.
 */
export interface ConsoleCaptureScope {
  readonly console: Record<ConsoleLevel, (...args: unknown[]) => void>;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

export interface ConsoleRingBufferOptions {
  /** Max entries retained before the oldest are evicted. Defaults to {@link DEFAULT_CONSOLE_BUFFER_SIZE}. */
  readonly maxSize?: number;
  /** Clock injection for deterministic tests; defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface ConsoleRingBufferHandle {
  /** Inert, defensive copy of the buffered entries, oldest → newest. */
  snapshot(): readonly ConsoleBufferEntry[];
  /** Restore the original console methods and detach the error listeners. */
  uninstall(): void;
}

/** Run one value through the bounded, cycle-safe serializer and re-parse it into an inert copy. */
function freeze(value: unknown): unknown {
  // safeStringify always returns valid JSON, so JSON.parse cannot throw here.
  return JSON.parse(safeStringify(value)) as unknown;
}

/**
 * Patch `scope.console` and hook global error events so every call lands in a bounded FIFO buffer.
 * Captured arguments are serialized eagerly, so the buffer holds no references to page objects and
 * surviving entries reflect the value at log time. Returns a handle to read or tear down the capture.
 */
export function installConsoleRingBuffer(
  scope: ConsoleCaptureScope,
  options: ConsoleRingBufferOptions = {},
): ConsoleRingBufferHandle {
  const maxSize = options.maxSize ?? DEFAULT_CONSOLE_BUFFER_SIZE;
  const now = options.now ?? Date.now;
  const buffer = new RingBuffer<ConsoleBufferEntry>(maxSize);

  // Undo functions accumulated while installing, replayed in reverse on uninstall.
  const restorers: Array<() => void> = [];

  for (const level of CONSOLE_LEVELS) {
    const original = scope.console[level];
    if (typeof original !== 'function') {
      continue; // host may not implement every method (e.g. some embedded webviews)
    }
    const patched = (...args: unknown[]): void => {
      try {
        buffer.push({ type: 'console', level, args: args.map(freeze), timestamp: now() });
      } catch {
        // Capture must never break the page's own logging.
      }
      original.apply(scope.console, args);
    };
    scope.console[level] = patched;
    restorers.push(() => {
      // Only restore if still ours, so we don't clobber a console another tool re-patched later.
      if (scope.console[level] === patched) {
        scope.console[level] = original;
      }
    });
  }

  const onError = (event: unknown): void => {
    try {
      const e = event as { message?: unknown; error?: unknown };
      buffer.push({ type: 'error', args: [freeze(e.message), freeze(e.error)], timestamp: now() });
    } catch {
      // ignore
    }
  };
  const onRejection = (event: unknown): void => {
    try {
      const e = event as { reason?: unknown };
      buffer.push({ type: 'unhandledrejection', args: [freeze(e.reason)], timestamp: now() });
    } catch {
      // ignore
    }
  };

  scope.addEventListener('error', onError);
  scope.addEventListener('unhandledrejection', onRejection);
  restorers.push(() => {
    scope.removeEventListener('error', onError);
    scope.removeEventListener('unhandledrejection', onRejection);
  });

  return {
    snapshot: () => buffer.snapshot(),
    uninstall() {
      while (restorers.length > 0) {
        restorers.pop()?.();
      }
      buffer.clear();
    },
  };
}
