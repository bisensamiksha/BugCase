import { describe, expect, it, vi } from 'vitest';

import {
  CONSOLE_LEVELS,
  DEFAULT_CONSOLE_BUFFER_SIZE,
  installConsoleRingBuffer,
  type ConsoleCaptureScope,
} from './console-ring-buffer';

type Listener = (event: unknown) => void;

/** A fake MAIN-world scope: a recording console + a dispatchable error/rejection event target. */
function createFakeScope() {
  const original: Record<string, unknown[][]> = {};
  const console: Record<string, (...args: unknown[]) => void> = {};
  for (const level of CONSOLE_LEVELS) {
    const calls: unknown[][] = (original[level] = []);
    console[level] = (...args: unknown[]) => {
      calls.push(args);
    };
  }
  const listeners = new Map<string, Set<Listener>>();
  const scope: ConsoleCaptureScope = {
    console,
    addEventListener(type, listener) {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
  const dispatch = (type: string, event: unknown) =>
    listeners.get(type)?.forEach((listener) => listener(event));
  return { scope, console, original, dispatch };
}

describe('installConsoleRingBuffer onError', () => {
  it('fires onError for uncaught errors and rejections, but not for console.error', () => {
    const fake = createFakeScope();
    const onError = vi.fn();
    installConsoleRingBuffer(fake.scope, { onError });

    fake.dispatch('error', { message: 'boom' });
    fake.dispatch('unhandledrejection', { reason: 'nope' });
    expect(onError).toHaveBeenCalledTimes(2);

    // console.error is a logged message, not an uncaught error — it must not bump the badge.
    fake.scope.console.error('handled, logged on purpose');
    expect(onError).toHaveBeenCalledTimes(2);
  });
});

describe('installConsoleRingBuffer', () => {
  it('captures console calls while still invoking the original method', () => {
    const fake = createFakeScope();
    const buffer = installConsoleRingBuffer(fake.scope, { now: () => 123 });

    fake.scope.console.warn('hello', 42);

    expect(fake.original.warn).toEqual([['hello', 42]]); // original behavior preserved
    expect(buffer.snapshot()).toEqual([
      { type: 'console', level: 'warn', args: ['hello', 42], timestamp: 123 },
    ]);
  });

  it('patches every standard console level', () => {
    const fake = createFakeScope();
    const buffer = installConsoleRingBuffer(fake.scope);
    for (const level of CONSOLE_LEVELS) fake.scope.console[level]('x');
    expect(buffer.snapshot().map((e) => e.level)).toEqual([...CONSOLE_LEVELS]);
  });

  it('serializes args so the buffer does not retain references to page objects', () => {
    const fake = createFakeScope();
    const buffer = installConsoleRingBuffer(fake.scope);

    const live = { a: 1 };
    fake.scope.console.log(live);
    live.a = 999; // mutate after logging

    expect(buffer.snapshot()[0]?.args).toEqual([{ a: 1 }]); // captured value, not the live ref
  });

  it('is cycle-safe and never throws on hostile args', () => {
    const fake = createFakeScope();
    const buffer = installConsoleRingBuffer(fake.scope);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => fake.scope.console.log(cyclic)).not.toThrow();
    expect(buffer.snapshot()[0]?.args).toEqual([{ self: '[Circular]' }]);
  });

  it('caps the buffer at maxSize, dropping the oldest entries', () => {
    const fake = createFakeScope();
    const buffer = installConsoleRingBuffer(fake.scope, { maxSize: 3 });
    for (let i = 0; i < 5; i += 1) fake.scope.console.log(i);
    expect(buffer.snapshot().map((e) => e.args[0])).toEqual([2, 3, 4]);
  });

  it('captures window error events', () => {
    const fake = createFakeScope();
    const buffer = installConsoleRingBuffer(fake.scope, { now: () => 7 });

    fake.dispatch('error', { message: 'boom', error: new Error('boom') });

    const entry = buffer.snapshot()[0];
    expect(entry?.type).toBe('error');
    expect(entry?.timestamp).toBe(7);
    expect(JSON.stringify(entry?.args)).toContain('boom');
  });

  it('captures unhandled promise rejections', () => {
    const fake = createFakeScope();
    const buffer = installConsoleRingBuffer(fake.scope);

    fake.dispatch('unhandledrejection', { reason: new Error('nope') });

    const entry = buffer.snapshot()[0];
    expect(entry?.type).toBe('unhandledrejection');
    expect(JSON.stringify(entry?.args)).toContain('nope');
  });

  it('restores the original console and removes listeners on uninstall', () => {
    const fake = createFakeScope();
    const originalLog = fake.scope.console.log;
    const buffer = installConsoleRingBuffer(fake.scope);
    expect(fake.scope.console.log).not.toBe(originalLog); // patched while installed

    buffer.uninstall();

    expect(fake.scope.console.log).toBe(originalLog); // original restored
    fake.scope.console.log('after');
    fake.dispatch('error', { message: 'late' });
    expect(buffer.snapshot()).toEqual([]); // nothing recorded after uninstall
    expect(fake.original.log).toEqual([['after']]); // original still works
  });

  it('defaults to a 500-entry buffer', () => {
    expect(DEFAULT_CONSOLE_BUFFER_SIZE).toBe(500);
    const fake = createFakeScope();
    const buffer = installConsoleRingBuffer(fake.scope);
    for (let i = 0; i < DEFAULT_CONSOLE_BUFFER_SIZE + 10; i += 1) fake.scope.console.log(i);
    expect(buffer.snapshot()).toHaveLength(DEFAULT_CONSOLE_BUFFER_SIZE);
  });

  it('does not throw when installing on a scope missing some console methods', () => {
    const partial: ConsoleCaptureScope = {
      // Only `log` is present at runtime — the cast lets us hand in a deliberately incomplete console.
      console: { log: vi.fn() } as unknown as ConsoleCaptureScope['console'],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    expect(() => installConsoleRingBuffer(partial)).not.toThrow();
  });
});
