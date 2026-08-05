import { darkTheme, lightTheme, RADIUS, type ThemeTokens } from './themes';

/**
 * Semantic token → CSS custom-property name. The `--bc-` prefix and the existing eight names are
 * inherited from S4-01 so the dashboard's ~275 existing `var(--bc-*)` references keep working.
 */
export const CSS_VAR_NAME: Record<keyof ThemeTokens, string> = {
  bg: '--bc-bg',
  surface: '--bc-surface',
  surfaceMuted: '--bc-surface-muted',
  border: '--bc-border',
  borderStrong: '--bc-border-strong',
  fg: '--bc-fg',
  fgMuted: '--bc-fg-muted',
  accent: '--bc-accent',
  accentFg: '--bc-accent-fg',

  danger: '--bc-danger',
  dangerStrong: '--bc-danger-strong',
  dangerBg: '--bc-danger-bg',
  dangerBgStrong: '--bc-danger-bg-strong',
  dangerBorder: '--bc-danger-border',

  warning: '--bc-warning',
  warningStrong: '--bc-warning-strong',
  warningBg: '--bc-warning-bg',
  warningBgStrong: '--bc-warning-bg-strong',
  warningOnBg: '--bc-warning-on-bg',
  warningBorder: '--bc-warning-border',

  success: '--bc-success',

  syntaxValue: '--bc-syntax-value',
  syntaxKey: '--bc-syntax-key',
  syntaxSummary: '--bc-syntax-summary',
  syntaxGuide: '--bc-syntax-guide',

  stepClick: '--bc-step-click',
  stepInput: '--bc-step-input',
  stepScroll: '--bc-step-scroll',
  stepModifier: '--bc-step-modifier',
  stepNavigation: '--bc-step-navigation',
};

const TOKEN_ORDER = Object.keys(CSS_VAR_NAME) as (keyof ThemeTokens)[];

function declarations(theme: ThemeTokens, indent: string): string {
  return TOKEN_ORDER.map((token) => `${indent}${CSS_VAR_NAME[token]}: ${theme[token]};`).join('\n');
}

/**
 * Build the full token stylesheet.
 *
 * Three blocks, in this order:
 * 1. `:root` — the light theme, and the radius.
 * 2. A `prefers-color-scheme: dark` block scoped `:root:not([data-theme='light'])`. This is the
 *    **pre-JS fallback**: it styles a dark-OS visitor correctly before the theme controller has
 *    mounted, so there is no flash, while still yielding to an explicit light choice.
 * 3. `:root[data-theme='dark']` — the resolved attribute the controller always writes.
 *
 * The committed `tokens.css` is this function's output, gated by a file-snapshot test. Regenerate
 * with `pnpm --filter @bugcase/shared-tokens generate`.
 */
export function emitTokensCss(): string {
  return `/*
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Source of truth: packages/shared-tokens/src/{primitives,themes,css-vars}.ts
 * Regenerate:      pnpm --filter @bugcase/shared-tokens generate
 *
 * A file-snapshot test (css-vars.test.ts) fails if this file drifts from the TypeScript source.
 */

:root {
${declarations(lightTheme, '  ')}
  --bc-radius: ${RADIUS};
}

/* Pre-JS fallback: correct colours for a dark-OS visitor before the theme controller mounts. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${declarations(darkTheme, '    ')}
  }
}

/* The resolved attribute written by the theme controller. */
:root[data-theme='dark'] {
${declarations(darkTheme, '  ')}
}
`;
}
