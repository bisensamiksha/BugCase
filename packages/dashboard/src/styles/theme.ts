/**
 * Theme state for the dashboard (S4-25): a persisted light/dark/system choice, resolved against the
 * OS preference and written to the root element as `data-theme`.
 *
 * The attribute is the single signal the rest of the styling keys off — the `--bc-*` token blocks in
 * `@bugcase/shared-tokens`, Tailwind's `dark:` variants (configured with the `selector` strategy),
 * and the Shiki flip in `shiki-theme.css`. Because the controller always writes a *resolved* value,
 * those three can never disagree about what theme is active.
 *
 * Every storage access is total: `report.html` runs from a `file://` origin where localStorage can
 * be denied outright, and a bug report viewer that throws on load would be worse than one that
 * forgets a preference.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bugcase.theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'system', 'dark'];
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Resolve a choice against the OS preference. Pure. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return choice;
}

/** Read the persisted choice, degrading to `'system'` for missing, corrupt or inaccessible values. */
export function readStoredChoice(storage: Storage | null | undefined): ThemeChoice {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Persist the choice. A storage failure is swallowed — the session still honours the choice. */
export function storeChoice(storage: Storage | null | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Denied or full storage: the choice still applies until the page is reloaded.
  }
}

/** Write the resolved theme to the root element. */
export function applyResolvedTheme(root: HTMLElement, resolved: ResolvedTheme): void {
  root.setAttribute('data-theme', resolved);
}

export interface ThemeControllerOptions {
  readonly root: HTMLElement;
  readonly storage: Storage | null | undefined;
  /** The `prefers-color-scheme: dark` query, or null where `matchMedia` is unavailable. */
  readonly media: MediaQueryList | null | undefined;
  /** Called after any change, with the new choice and what it resolved to. */
  readonly onChange?: (choice: ThemeChoice, resolved: ResolvedTheme) => void;
}

export interface ThemeController {
  getChoice(): ThemeChoice;
  setChoice(choice: ThemeChoice): void;
  destroy(): void;
}

/**
 * Wire persistence, OS preference and the root attribute together.
 *
 * The OS listener stays subscribed for the controller's whole life but only *acts* while the choice
 * is `'system'`, so switching to system later picks up live changes without re-subscribing.
 */
export function createThemeController({
  root,
  storage,
  media,
  onChange,
}: ThemeControllerOptions): ThemeController {
  let choice = readStoredChoice(storage);

  const prefersDark = () => media?.matches ?? false;

  const apply = () => {
    const resolved = resolveTheme(choice, prefersDark());
    applyResolvedTheme(root, resolved);
    onChange?.(choice, resolved);
  };

  const handleMediaChange = () => {
    if (choice === 'system') {
      apply();
    }
  };

  media?.addEventListener('change', handleMediaChange);
  apply();

  return {
    getChoice: () => choice,
    setChoice(next: ThemeChoice) {
      choice = next;
      storeChoice(storage, next);
      apply();
    },
    destroy() {
      media?.removeEventListener('change', handleMediaChange);
    },
  };
}

/**
 * Build a controller against the real document. Returns null when there is no DOM (SSR, tests that
 * import the module without jsdom), so callers can no-op safely.
 */
export function createDocumentThemeController(
  onChange?: (choice: ThemeChoice, resolved: ResolvedTheme) => void,
): ThemeController | null {
  if (typeof document === 'undefined') {
    return null;
  }

  let storage: Storage | null = null;
  try {
    storage = globalThis.localStorage;
  } catch {
    // file:// origins can throw on the property access itself, not just on getItem.
    storage = null;
  }

  const media =
    typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(DARK_MEDIA_QUERY) : null;

  return createThemeController({
    root: document.documentElement,
    storage,
    media,
    ...(onChange ? { onChange } : {}),
  });
}
