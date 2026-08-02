// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyResolvedTheme,
  createThemeController,
  readStoredChoice,
  resolveTheme,
  storeChoice,
  THEME_STORAGE_KEY,
} from './theme';

/** A Storage double whose failure modes can be switched on per test. */
function fakeStorage(
  initial: Record<string, string> = {},
): Storage & { fail: (on: boolean) => void } {
  const data = new Map(Object.entries(initial));
  let failing = false;
  return {
    fail(on: boolean) {
      failing = on;
    },
    getItem(key: string) {
      if (failing) throw new DOMException('denied', 'SecurityError');
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (failing) throw new DOMException('denied', 'SecurityError');
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    get length() {
      return data.size;
    },
  };
}

/** A matchMedia double that can emit an OS preference change. */
function fakeMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;

  return {
    mql,
    listenerCount: () => listeners.size,
    emit(next: boolean) {
      (mql as { matches: boolean }).matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

describe('resolveTheme', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('resolves %s with prefersDark=%s to %s', (choice, prefersDark, expected) => {
    expect(resolveTheme(choice, prefersDark)).toBe(expected);
  });
});

describe('choice persistence', () => {
  it('round-trips a stored choice', () => {
    const storage = fakeStorage();
    storeChoice(storage, 'dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredChoice(storage)).toBe('dark');
  });

  it('defaults to system when nothing is stored', () => {
    expect(readStoredChoice(fakeStorage())).toBe('system');
  });

  it('falls back to system for an unrecognised stored value', () => {
    expect(readStoredChoice(fakeStorage({ [THEME_STORAGE_KEY]: 'chartreuse' }))).toBe('system');
  });

  it('falls back to system when reading throws', () => {
    // report.html runs from file://, where storage access can be denied outright.
    const storage = fakeStorage();
    storage.fail(true);
    expect(readStoredChoice(storage)).toBe('system');
  });

  it('swallows a write failure instead of propagating it', () => {
    const storage = fakeStorage();
    storage.fail(true);
    expect(() => storeChoice(storage, 'dark')).not.toThrow();
  });

  it('tolerates a null storage', () => {
    expect(readStoredChoice(null)).toBe('system');
    expect(() => storeChoice(null, 'light')).not.toThrow();
  });
});

describe('applyResolvedTheme', () => {
  it('writes the resolved theme to the root element', () => {
    const root = document.createElement('html');
    applyResolvedTheme(root, 'dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyResolvedTheme(root, 'light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });
});

describe('createThemeController', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
  });

  it('applies the stored choice on creation', () => {
    const controller = createThemeController({
      root,
      storage: fakeStorage({ [THEME_STORAGE_KEY]: 'dark' }),
      media: fakeMedia(false).mql,
    });
    expect(controller.getChoice()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    controller.destroy();
  });

  it('resolves system against the OS preference on creation', () => {
    const controller = createThemeController({
      root,
      storage: fakeStorage(),
      media: fakeMedia(true).mql,
    });
    expect(controller.getChoice()).toBe('system');
    expect(root.getAttribute('data-theme')).toBe('dark');
    controller.destroy();
  });

  it('persists and applies a new choice', () => {
    const storage = fakeStorage();
    const controller = createThemeController({ root, storage, media: fakeMedia(false).mql });
    controller.setChoice('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    controller.destroy();
  });

  it('follows a live OS change while the choice is system', () => {
    const media = fakeMedia(false);
    const controller = createThemeController({ root, storage: fakeStorage(), media: media.mql });
    expect(root.getAttribute('data-theme')).toBe('light');
    media.emit(true);
    expect(root.getAttribute('data-theme')).toBe('dark');
    controller.destroy();
  });

  it('ignores a live OS change once an explicit choice is made', () => {
    const media = fakeMedia(false);
    const controller = createThemeController({ root, storage: fakeStorage(), media: media.mql });
    controller.setChoice('light');
    media.emit(true);
    expect(root.getAttribute('data-theme')).toBe('light');
    controller.destroy();
  });

  it('notifies a subscriber when the choice changes', () => {
    const onChange = vi.fn();
    const controller = createThemeController({
      root,
      storage: fakeStorage(),
      media: fakeMedia(false).mql,
      onChange,
    });
    controller.setChoice('dark');
    expect(onChange).toHaveBeenCalledWith('dark', 'dark');
    controller.destroy();
  });

  it('unsubscribes from the media query on destroy', () => {
    const media = fakeMedia(false);
    const controller = createThemeController({ root, storage: fakeStorage(), media: media.mql });
    expect(media.listenerCount()).toBe(1);
    controller.destroy();
    expect(media.listenerCount()).toBe(0);
  });

  it('still applies a theme when there is no media query available', () => {
    const controller = createThemeController({ root, storage: fakeStorage(), media: null });
    expect(root.getAttribute('data-theme')).toBe('light');
    controller.destroy();
  });
});
