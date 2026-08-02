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
  fg: palette.slate800,
  fgMuted: palette.slate500,
  accent: palette.blue600,
  accentFg: palette.white,

  danger: palette.red600,
  dangerStrong: palette.red700,
  dangerBg: palette.red50,
  dangerBgStrong: palette.red100,
  dangerBorder: palette.red300,

  warning: palette.amber600,
  warningStrong: palette.amber700,
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
 * Where the dashboard already shipped a `dark:` Tailwind variant, that variant's value is used, so
 * dark mode renders exactly as it does today. Where no dark variant existed — most of the danger
 * group, `success`, and the JSON syntax colours — the light value is **deliberately mirrored**
 * rather than invented: S4-25 moves values, it does not redesign them. Raising the contrast of those
 * roles against a dark surface is a real improvement, but it is a design decision that belongs to
 * the S4-27 accessibility pass, where it can be judged against measured contrast ratios.
 */
export const darkTheme: ThemeTokens = {
  bg: palette.slate900,
  surface: palette.slate800,
  surfaceMuted: palette.slate700,
  border: palette.slate700,
  fg: palette.slate200,
  fgMuted: palette.slate400,
  accent: palette.blue500,
  accentFg: palette.white,

  // no `dark:` variants shipped for the danger group — mirrored, see the note above
  danger: palette.red600,
  dangerStrong: palette.red700,
  dangerBg: palette.red50,
  dangerBgStrong: palette.red100,
  dangerBorder: palette.red300,

  warning: palette.amber600,
  warningStrong: palette.amber700,
  warningBg: palette.amber950,
  warningBgStrong: palette.amber100,
  warningOnBg: palette.amber200,
  warningBorder: palette.amber500,

  success: palette.emerald700,

  syntaxValue: palette.emerald700,
  syntaxKey: palette.slate500,
  syntaxSummary: palette.slate600,
  syntaxGuide: palette.slate200,

  stepClick: palette.blue300,
  stepInput: palette.emerald300,
  stepScroll: palette.slate300,
  stepModifier: palette.purple300,
  stepNavigation: palette.amber300,
};

/** Corner radius shared by both themes. Not a colour, so it sits outside {@link ThemeTokens}. */
export const RADIUS = '0.5rem';
