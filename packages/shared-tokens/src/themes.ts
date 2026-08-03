import { palette } from './primitives';

/**
 * The semantic token contract (S4-25). Every field names a *role*, not a colour, and resolves to an
 * entry of the primitive scale — never to a fresh literal. The dashboard consumes these through the
 * emitted CSS custom properties; see `css-vars.ts`.
 *
 * Groups:
 * - **chrome** — page, surface, border and text roles established by S4-01.
 * - **status** — danger and warning roles, previously written as raw Tailwind utilities in the
 *   dashboard and raw hex in the extension.
 * - **syntax** — the JSON tree's value/key/guide colours (a category palette, not a status one).
 * - **step** — the reproduction pane's step-kind tints, likewise a category palette.
 */
export interface ThemeTokens {
  // chrome
  readonly bg: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly border: string;
  /** Boundary for controls that need one to be identifiable (WCAG 1.4.11). Decorative dividers use `border`. */
  readonly borderStrong: string;
  readonly fg: string;
  readonly fgMuted: string;
  readonly accent: string;
  readonly accentFg: string;

  // status — danger
  readonly danger: string;
  readonly dangerStrong: string;
  readonly dangerBg: string;
  readonly dangerBgStrong: string;
  readonly dangerBorder: string;

  // status — warning
  readonly warning: string;
  readonly warningStrong: string;
  readonly warningBg: string;
  readonly warningBgStrong: string;
  readonly warningOnBg: string;
  readonly warningBorder: string;

  // status — success
  readonly success: string;

  // JSON tree category palette
  readonly syntaxValue: string;
  readonly syntaxKey: string;
  readonly syntaxSummary: string;
  readonly syntaxGuide: string;

  // reproduction step-kind category palette
  readonly stepClick: string;
  readonly stepInput: string;
  readonly stepScroll: string;
  readonly stepModifier: string;
  readonly stepNavigation: string;
}

export const lightTheme: ThemeTokens = {
  bg: palette.slate50,
  surface: palette.white,
  surfaceMuted: palette.slate100,
  border: palette.slate200,
  borderStrong: palette.slate500, // NEW — 4.76:1 on white, clears 1.4.11
  fg: palette.slate800,
  fgMuted: palette.slate500,
  accent: palette.blue600,
  accentFg: palette.white,

  danger: palette.red600,
  dangerStrong: palette.red700,
  dangerBg: palette.red50,
  dangerBgStrong: palette.red100,
  dangerBorder: palette.red300,

  warning: palette.amber700, // was amber600 — 3.19:1 on white, now 5.02:1
  warningStrong: palette.amber900, // was amber700 — keeps the two roles distinct now that
  // `warning` took amber700; 9.07:1 on white
  warningBg: palette.amber50,
  warningBgStrong: palette.amber100,
  warningOnBg: palette.amber900,
  warningBorder: palette.amber400,

  success: palette.emerald700,

  syntaxValue: palette.emerald700,
  syntaxKey: palette.slate500,
  syntaxSummary: palette.slate600,
  syntaxGuide: palette.slate200,

  stepClick: palette.blue700,
  stepInput: palette.emerald700,
  stepScroll: palette.slate600,
  stepModifier: palette.purple700,
  stepNavigation: palette.amber700,
};

/**
 * Dark values.
 *
 * S4-25 mirrored the light values for the roles that had no `dark:` Tailwind variant — the danger
 * group, `success`, and the JSON syntax colours — and explicitly deferred the contrast judgement to
 * this ticket. S4-27 made it: those mirrors measured between 1.12:1 and 3.07:1 against a dark
 * surface, so each moved up the primitive scale until the pair matrix in `contrast.test.ts` passed.
 * The two structural fixes are `accent`/`accentFg` (white on blue-500 was 3.68:1, so the pill is now
 * a lighter blue with dark text) and the `dangerBg`/`warningBgStrong` family, which were still
 * *light* tints inside the dark theme.
 */
export const darkTheme: ThemeTokens = {
  bg: palette.slate900,
  surface: palette.slate800,
  surfaceMuted: palette.slate700,
  border: palette.slate700,
  borderStrong: palette.slate500,
  fg: palette.slate200,
  fgMuted: palette.slate400,

  // White on blue-500 measured 3.68:1. Inverting the pill — lighter field, dark text — clears both
  // this pair (7.02:1) and accent-as-text on a card (5.75:1); darkening the blue would fix only one.
  accent: palette.blue400,
  accentFg: palette.slate900,

  danger: palette.red400,
  dangerStrong: palette.red300,
  dangerBg: palette.red950,
  dangerBgStrong: palette.red900,
  dangerBorder: palette.red700,

  warning: palette.amber300,
  warningStrong: palette.amber400,
  warningBg: palette.amber950,
  warningBgStrong: palette.amber900,
  warningOnBg: palette.amber200,
  warningBorder: palette.amber500,

  success: palette.emerald400,

  syntaxValue: palette.emerald400,
  syntaxKey: palette.slate400,
  syntaxSummary: palette.slate300,
  syntaxGuide: palette.slate700,

  stepClick: palette.blue300,
  stepInput: palette.emerald300,
  stepScroll: palette.slate300,
  stepModifier: palette.purple300,
  stepNavigation: palette.amber300,
};

/** Corner radius shared by both themes. Not a colour, so it sits outside {@link ThemeTokens}. */
export const RADIUS = '0.5rem';
