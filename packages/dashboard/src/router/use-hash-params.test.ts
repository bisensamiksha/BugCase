// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RouteState } from './hash-router';
import { createHashParamWriter, HASH_WRITE_DEBOUNCE_MS } from './use-hash-params';

beforeEach(() => {
  vi.useFakeTimers();
  window.location.hash = '#/console/r1';
});

afterEach(() => {
  vi.useRealTimers();
});

const route = { activePane: 'console', reportId: 'r1' } as const;

describe('createHashParamWriter', () => {
  it('writes the formatted hash after the debounce window', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const writer = createHashParamWriter(() => route);

    writer.write({ q: 'timeout' }, 'console');
    expect(replaceState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS);

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0]?.[2]).toBe('#/console/r1?q=timeout');
    writer.dispose();
  });

  it('coalesces a burst of changes into a single write', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const writer = createHashParamWriter(() => route);

    // Typing produces one call per keystroke; the URL should be written once.
    for (const q of ['t', 'ti', 'tim', 'time']) {
      writer.write({ q }, 'console');
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS);

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0]?.[2]).toBe('#/console/r1?q=time');
    writer.dispose();
  });

  it('uses replaceState so filtering never grows the back-history', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const writer = createHashParamWriter(() => route);

    writer.write({ q: 'x' }, 'console');
    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS);

    // Back must return to the previous pane, not replay twenty keystrokes.
    expect(pushState).not.toHaveBeenCalled();
    writer.dispose();
  });

  it('drops a pending write after dispose', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const writer = createHashParamWriter(() => route);

    writer.write({ q: 'pending' }, 'console');
    writer.dispose();
    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS * 4);

    expect(replaceState).not.toHaveBeenCalled();
  });

  it('skips the write when the hash would not change', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const writer = createHashParamWriter(() => route);

    // The mount-time report of an unfiltered pane must not churn the URL.
    writer.write({}, 'console');
    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS);

    expect(replaceState).not.toHaveBeenCalled();
    writer.dispose();
  });

  it('drops a queued write once the user has left that pane', () => {
    // Both console and network use `q`. Without this guard a console keystroke still in flight
    // lands on whatever pane you navigated to, and seeds its search box.
    const replaceState = vi.spyOn(window.history, 'replaceState');
    let current: RouteState = { activePane: 'console', reportId: 'r1' };
    const writer = createHashParamWriter(() => current);

    writer.write({ q: 'bugcase' }, 'console');
    current = { activePane: 'screenshots', reportId: 'r1' };
    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS);

    expect(replaceState).not.toHaveBeenCalled();
    writer.dispose();
  });

  it('survives a history that refuses replaceState', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const writer = createHashParamWriter(() => route);

    writer.write({ q: 'x' }, 'console');
    expect(() => vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS)).not.toThrow();

    replaceState.mockRestore();
    writer.dispose();
  });
});
