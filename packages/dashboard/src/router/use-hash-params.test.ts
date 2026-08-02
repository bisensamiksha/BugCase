// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    writer.write({ q: 'timeout' });
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
      writer.write({ q });
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

    writer.write({ q: 'x' });
    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS);

    // Back must return to the previous pane, not replay twenty keystrokes.
    expect(pushState).not.toHaveBeenCalled();
    writer.dispose();
  });

  it('drops a pending write after dispose', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const writer = createHashParamWriter(() => route);

    writer.write({ q: 'pending' });
    writer.dispose();
    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS * 4);

    expect(replaceState).not.toHaveBeenCalled();
  });

  it('skips the write when the hash would not change', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const writer = createHashParamWriter(() => route);

    // The mount-time report of an unfiltered pane must not churn the URL.
    writer.write({});
    vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS);

    expect(replaceState).not.toHaveBeenCalled();
    writer.dispose();
  });

  it('survives a history that refuses replaceState', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const writer = createHashParamWriter(() => route);

    writer.write({ q: 'x' });
    expect(() => vi.advanceTimersByTime(HASH_WRITE_DEBOUNCE_MS)).not.toThrow();

    replaceState.mockRestore();
    writer.dispose();
  });
});
