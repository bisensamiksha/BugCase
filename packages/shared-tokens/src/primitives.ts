/**
 * The primitive colour scale — the single place in the repo where a colour literal exists (S4-25).
 *
 * These are the Tailwind default-palette values already in use across the dashboard and the
 * extension, named for their Tailwind identity so a reviewer can check any entry against
 * https://tailwindcss.com/docs/customizing-colors at a glance. Nothing here is a new colour: the
 * scale is the union of what both packages already shipped, so adopting it changes no pixels.
 *
 * Consumers pick a layer:
 * - the **dashboard** consumes the semantic tokens in `themes.ts` (via CSS custom properties), and
 * - the **extension** consumes these primitives directly in its inline styles, because its overlay
 *   injects into arbitrary pages through a Shadow DOM and cannot rely on a stylesheet.
 */
export const palette = {
  white: '#ffffff',
  black: '#000000',

  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',

  blue300: '#93c5fd',
  blue400: '#60a5fa',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue700: '#1d4ed8',

  red50: '#fef2f2',
  red100: '#fee2e2',
  red200: '#fecaca',
  red300: '#fca5a5',
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red700: '#b91c1c',
  red800: '#991b1b',
  red900: '#7f1d1d',
  red950: '#450a0a',

  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber300: '#fcd34d',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',
  amber900: '#78350f',
  amber950: '#451a03',

  emerald300: '#6ee7b7',
  emerald400: '#34d399',
  emerald700: '#047857',

  green500: '#22c55e',
  green600: '#16a34a',

  orange100: '#ffedd5',
  orange500: '#f97316',
  orange900: '#7c2d12',

  purple300: '#d8b4fe',
  purple700: '#7e22ce',
} as const;

/** A key of the primitive scale, e.g. `'slate600'`. */
export type PrimitiveName = keyof typeof palette;
