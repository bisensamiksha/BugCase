import { describe, expect, it } from 'vitest';

import { contrastRatio, meetsAA, relativeLuminance } from './contrast';
import { darkTheme, lightTheme, type ThemeTokens } from './themes';

describe('relativeLuminance', () => {
  it('returns 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('applies the sRGB linearisation curve, not a raw average', () => {
    // Mid grey is perceptually ~50% but linearises to ~0.216 (WCAG 2.1 formula).
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('accepts uppercase hex', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
  });

  it('rejects malformed input rather than returning a silent wrong answer', () => {
    expect(() => relativeLuminance('fff')).toThrow(/hex/i);
    expect(() => relativeLuminance('#ggg000')).toThrow(/hex/i);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#2563eb', '#2563eb')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#2563eb'),
      10,
    );
  });

  it('matches a known reference value', () => {
    // blue-600 on white — the dashboard's light-theme accent.
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(5.17, 2);
  });
});

describe('meetsAA', () => {
  it('requires 4.5:1 for normal text', () => {
    expect(meetsAA(4.5)).toBe(true);
    expect(meetsAA(4.49)).toBe(false);
  });

  it('requires only 3:1 for large text', () => {
    expect(meetsAA(3, { large: true })).toBe(true);
    expect(meetsAA(2.99, { large: true })).toBe(false);
  });
});

type Role = keyof ThemeTokens;

/**
 * The composition matrix: which foreground role the design system permits on which background role.
 *
 * This is a *permission list*, not a cross-product. A cross-product would force every role to be
 * maximally contrasty and collapse the `fg` / `fgMuted` hierarchy. Adding a pair here is how a new
 * colour combination gets sanctioned; using an unlisted pair in a component is a review-time error.
 */
const MATRIX: readonly (readonly [Role, Role, number])[] = [
  // chrome text
  ['fg', 'bg', 4.5],
  ['fg', 'surface', 4.5],
  ['fg', 'surfaceMuted', 4.5],
  ['fgMuted', 'bg', 4.5],
  ['fgMuted', 'surface', 4.5],
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['accentFg', 'accent', 4.5],

  // danger
  ['danger', 'bg', 4.5],
  ['danger', 'surface', 4.5],
  ['dangerStrong', 'dangerBg', 4.5],
  ['dangerStrong', 'dangerBgStrong', 4.5],

  // warning
  ['warning', 'bg', 4.5],
  ['warning', 'surface', 4.5],
  ['warningStrong', 'surface', 4.5],
  ['warningStrong', 'warningBgStrong', 4.5],
  ['warningOnBg', 'warningBg', 4.5],
  ['warningOnBg', 'warningBgStrong', 4.5],

  // success
  ['success', 'bg', 4.5],
  ['success', 'surface', 4.5],

  // JSON tree
  ['syntaxValue', 'surface', 4.5],
  ['syntaxKey', 'surface', 4.5],
  ['syntaxSummary', 'surface', 4.5],

  // reproduction step kinds
  ['stepClick', 'surface', 4.5],
  ['stepInput', 'surface', 4.5],
  ['stepScroll', 'surface', 4.5],
  ['stepModifier', 'surface', 4.5],
  ['stepNavigation', 'surface', 4.5],

  // control boundaries — WCAG 2.1 SC 1.4.11 Non-text Contrast, 3:1
  ['borderStrong', 'surface', 3],
  ['borderStrong', 'bg', 3],
  ['accent', 'surface', 3],
];

/**
 * Roles deliberately absent from {@link MATRIX}, with the reason each one is not a control
 * boundary under SC 1.4.11:
 *
 * - `border` — card, table and scroll-container boundaries only. Every dashboard control (button,
 *   input, select, textarea) that used to sit on `border` was migrated to `--bc-border-strong`
 *   (S4-27); what is left on `border` is decoration, e.g. the boundary around a screenshot card or
 *   the divider under a tab strip.
 * - `syntaxGuide` — the JSON tree's indent guide line. Purely a visual alignment aid; the
 *   information (nesting depth) is also conveyed structurally.
 * - `dangerBorder` / `warningBorder` — the border on a static danger/warning callout. The callout's
 *   meaning is carried by its icon and text, not by the border being visible; the border is a
 *   finishing touch, not the only way to identify it.
 *
 * Forcing 3:1 on any of these would make every divider and callout heavy for no accessibility gain.
 * `--bc-border-strong` exists for the boundaries that are the only way to identify a control.
 */
const EXEMPT_DECORATIVE: readonly Role[] = [
  'border',
  'syntaxGuide',
  'dangerBorder',
  'warningBorder',
];

describe('token contrast', () => {
  for (const [themeName, theme] of [
    ['lightTheme', lightTheme],
    ['darkTheme', darkTheme],
  ] as const) {
    describe(themeName, () => {
      for (const [fg, bg, min] of MATRIX) {
        it(`${fg} on ${bg} meets ${min}:1`, () => {
          const ratio = contrastRatio(theme[fg], theme[bg]);
          expect(
            ratio,
            `${themeName}: ${fg} (${theme[fg]}) on ${bg} (${theme[bg]}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }

  it('documents every role as either matrixed or explicitly exempt', () => {
    const covered = new Set<Role>([
      ...MATRIX.flatMap(([fg, bg]) => [fg, bg]),
      ...EXEMPT_DECORATIVE,
    ]);
    const roles = Object.keys(lightTheme) as Role[];
    const undocumented = roles.filter((role) => !covered.has(role));
    expect(
      undocumented,
      'Add each role to MATRIX (with the surfaces it may sit on) or to EXEMPT_DECORATIVE (with a reason).',
    ).toEqual([]);
  });
});
