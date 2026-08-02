import { useEffect, useRef, useState } from 'react';

import {
  createDocumentThemeController,
  THEME_CHOICES,
  type ThemeChoice,
  type ThemeController,
} from '../styles/theme';

const LABELS: Record<ThemeChoice, string> = {
  light: 'Light',
  system: 'System',
  dark: 'Dark',
};

/**
 * Light / System / Dark control for the dashboard top bar (S4-25).
 *
 * The controller owns the theme; this component only mirrors it. `data-print-hide` keeps the
 * control off printed output, where the theme is forced light anyway.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const controllerRef = useRef<ThemeController | null>(null);

  useEffect(() => {
    const controller = createDocumentThemeController((next) => {
      setChoice(next);
    });
    controllerRef.current = controller;

    return () => {
      controller?.destroy();
      controllerRef.current = null;
    };
  }, []);

  return (
    <div
      data-testid="theme-toggle"
      data-print-hide
      role="group"
      aria-label="Theme"
      className="flex shrink-0 items-center gap-0.5 rounded-[var(--bc-radius)] border border-[var(--bc-border)] p-0.5"
    >
      {THEME_CHOICES.map((option) => {
        const active = option === choice;
        return (
          <button
            key={option}
            type="button"
            data-testid={`theme-${option}`}
            aria-pressed={active}
            onClick={() => controllerRef.current?.setChoice(option)}
            className={`rounded-[calc(var(--bc-radius)-2px)] px-2 py-0.5 text-xs ${
              active
                ? 'bg-[var(--bc-accent)] text-[var(--bc-accent-fg)]'
                : 'text-[var(--bc-fg-muted)] hover:text-[var(--bc-fg)]'
            }`}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
