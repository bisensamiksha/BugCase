// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY } from '../styles/theme';

import { ThemeToggle } from './ThemeToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

/** Install a controllable `matchMedia`; jsdom's own always reports `matches: false`. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  };
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => mql;
  return {
    emit(next: boolean) {
      mql.matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

/**
 * Install a Storage double. This jsdom build exposes no `localStorage` — the same condition
 * `report.html` hits when opened from `file://`, which is why the controller treats storage as
 * optional.
 */
function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

/** Remove the Storage double entirely, reproducing a denied `file://` origin. */
function removeStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

let storage: Storage;

const button = (choice: string) =>
  container.querySelector<HTMLButtonElement>(`[data-testid="theme-${choice}"]`);

beforeEach(() => {
  storage = stubStorage();
  document.documentElement.removeAttribute('data-theme');
  stubMatchMedia(false);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('ThemeToggle', () => {
  it('offers all three choices in a labelled group', () => {
    act(() => {
      root.render(<ThemeToggle />);
    });

    const group = container.querySelector('[data-testid="theme-toggle"]');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe('Theme');
    for (const choice of ['light', 'system', 'dark']) {
      expect(button(choice), choice).not.toBeNull();
    }
  });

  it('marks the active choice with aria-pressed', () => {
    act(() => {
      root.render(<ThemeToggle />);
    });

    expect(button('system')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('dark')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('applies and persists a chosen theme', () => {
    act(() => {
      root.render(<ThemeToggle />);
    });

    act(() => {
      button('dark')?.click();
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(button('dark')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('system')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('restores the persisted choice on mount', () => {
    storage.setItem(THEME_STORAGE_KEY, 'dark');

    act(() => {
      root.render(<ThemeToggle />);
    });

    expect(button('dark')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves system against the OS preference', () => {
    stubMatchMedia(true);

    act(() => {
      root.render(<ThemeToggle />);
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(button('system')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('follows a live OS change while set to system', () => {
    const media = stubMatchMedia(false);

    act(() => {
      root.render(<ThemeToggle />);
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => {
      media.emit(true);
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('stops following the OS once an explicit choice is made', () => {
    const media = stubMatchMedia(false);

    act(() => {
      root.render(<ThemeToggle />);
    });
    act(() => {
      button('light')?.click();
    });
    act(() => {
      media.emit(true);
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('still works when storage is unavailable', () => {
    // A file:// report.html can be denied storage entirely; the toggle must stay usable.
    removeStorage();

    act(() => {
      root.render(<ThemeToggle />);
    });
    act(() => {
      button('dark')?.click();
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(button('dark')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('is hidden from print output', () => {
    act(() => {
      root.render(<ThemeToggle />);
    });

    expect(
      container.querySelector('[data-testid="theme-toggle"]')?.hasAttribute('data-print-hide'),
    ).toBe(true);
  });
});
