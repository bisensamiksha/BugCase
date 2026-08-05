/**
 * WCAG 2.1 contrast math (S4-27).
 *
 * Pure and dependency-free so the token guard test (`contrast.test.ts`) can assert every permitted
 * foreground/background pair without a browser. This is the *authoritative* contrast check in the
 * repo: jsdom has no layout engine, so axe's `color-contrast` rule is disabled in unit tests and
 * only re-enabled in the real-browser Playwright run.
 *
 * Formulae: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance and #dfn-contrast-ratio
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** sRGB channel → linear-light value. */
function linearise(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Relative luminance of a `#rrggbb` colour: 0 for black, 1 for white.
 *
 * Throws on malformed input rather than coercing — a silently wrong luminance would make the guard
 * test pass while the UI is unreadable, which is the exact failure this module exists to prevent.
 */
export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) {
    throw new Error(`Expected a #rrggbb hex colour, received: ${hex}`);
  }
  const value = Number.parseInt(hex.slice(1), 16);
  const r = linearise((value >> 16) & 0xff);
  const g = linearise((value >> 8) & 0xff);
  const b = linearise(value & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two `#rrggbb` colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG AA threshold: 4.5:1 for body text, 3:1 for large text (≥18.66px bold or ≥24px regular).
 * The same 3:1 floor applies to control boundaries under SC 1.4.11.
 */
export function meetsAA(ratio: number, options: { large?: boolean } = {}): boolean {
  return ratio >= (options.large ? 3 : 4.5);
}
