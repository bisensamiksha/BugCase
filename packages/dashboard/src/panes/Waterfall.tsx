import { palette } from '@bugcase/shared-tokens';

import { FAILED_CLASS } from './network-filters';

export interface BarGeometry {
  /** Bar left edge, as a percentage of the track width (0–100). */
  readonly xPct: number;
  /** Bar width, as a percentage of the track width (0 = a marker, not a span). */
  readonly widthPct: number;
}

/** Smallest visible span (%) so a real-but-tiny request still shows a bar rather than a marker. */
const MIN_VISIBLE_PCT = 0.5;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Pure timing geometry for one request's waterfall bar. `xPct` is the start offset as a share of the
 * total captured range; `widthPct` is the duration's share, floored to {@link MIN_VISIBLE_PCT} so tiny
 * requests stay visible and capped so the bar never overflows the track. A null/zero duration yields a
 * zero-width marker (drawn as a thin tick by {@link Waterfall}). A non-positive total range is empty.
 */
export function barGeometry(
  startOffsetMs: number,
  durationMs: number | null,
  totalMs: number,
): BarGeometry {
  if (totalMs <= 0) {
    return { xPct: 0, widthPct: 0 };
  }
  const xPct = clamp((startOffsetMs / totalMs) * 100, 0, 100);
  if (durationMs === null || durationMs <= 0) {
    return { xPct, widthPct: 0 };
  }
  const raw = (durationMs / totalMs) * 100;
  const widthPct = clamp(Math.max(raw, MIN_VISIBLE_PCT), 0, 100 - xPct);
  return { xPct, widthPct };
}

/**
 * Neutral FILL for `1xx` / unmapped classes in {@link STATUS_CLASS_COLOR} — fixed, like every other
 * entry in that table (see its doc comment for why), not the theme-flipping `--bc-fg-muted` role.
 * `palette.slate500` measures 4.76:1 on white and 3.07:1 on the dark theme's `surface`, both inside
 * the floors that table needs; it happens to be the value light-mode `--bc-fg-muted` already renders
 * as, so this is a no-op for the light theme and a fix for the dark one.
 */
const NEUTRAL_FILL_COLOR: string = palette.slate500;

/**
 * Neutral TEXT for `1xx` / unmapped classes in {@link STATUS_CLASS_TEXT_COLOR} — deliberately kept as
 * the theme-flipping `--bc-fg-muted` role, NOT {@link NEUTRAL_FILL_COLOR}. This one sits directly on
 * the page background as text, which — per {@link STATUS_CLASS_TEXT_COLOR}'s doc comment — must flip
 * with the theme. Reusing the fixed fill color here would silently fail 4.5:1 in dark mode
 * (`slate500` measures only 3.07:1 on the dark theme's `bg`/`surface`) — exactly the class of bug
 * this file's S4-27 review round exists to catch, just moved to a different pair.
 */
const NEUTRAL_TEXT_COLOR = 'var(--bc-fg-muted)';

/**
 * Semantic status-class colors for solid graphical fills: the waterfall bars below and the network
 * filter chips' active background (`NetworkPane.tsx`, paired with hardcoded white text). Deliberately
 * fixed literals rather than the theme-flipping `--bc-*` status roles — those are tuned as *foreground
 * text on the page background* (light-mode value saturated, dark-mode value pastel, by design; see
 * `shared-tokens/src/themes.ts`), which would fail white-on-chip contrast badly once flipped to the
 * dark-mode pastel shade (e.g. white on `--bc-danger`'s dark value is 2.77:1). A fixed, theme-invariant
 * swatch is correct for a filled shape/chip rather than page text.
 *
 * A prior version of this comment claimed every value here "already clears 4.5:1 against white in
 * both themes precisely because it never changes." That was false — measured (S4-27 final review):
 * white-on-fill was 2.56:1 (`1xx` dark, via the then-theme-flipping neutral), 3.30:1 (`2xx`), 3.68:1
 * (`3xx`), 3.19:1 (`4xx`) — all real AA failures on the status filter chips, which default ON, so
 * essentially every real report rendered at least one failing chip. Only `5xx`/`failed` (4.83:1) and
 * `1xx` in light mode (4.76:1) happened to pass.
 *
 * Every value below is chosen to clear BOTH floors this table carries at once, computed with the
 * repo's own {@link contrastRatio} (`shared-tokens/src/contrast.ts`):
 * - white `text-xs` on the fill (the status chips) ≥ 4.5:1 — WCAG 1.4.3 text contrast.
 * - the fill against `--bc-bg`/`--bc-surface`, in both themes, ≥ 3:1 — WCAG 1.4.11 graphical contrast
 *   for the waterfall bars below. The dark theme's `surface` (`#1e293b`) is the binding case for
 *   every row (it is lower-contrast against these fills than dark `bg`, and both light-theme surfaces
 *   clear the floor easily since they are near-white).
 *
 * ```text
 *              white-on-fill   fill/dark-surface   fill/dark-bg   fill/light-bg   fill/light-surface
 *   1xx        4.76:1          3.07:1              3.75:1         4.55:1          4.76:1
 *   2xx        4.70:1          3.11:1              3.80:1         4.49:1          4.70:1
 *   3xx        4.76:1          3.08:1              3.75:1         4.55:1          4.76:1
 *   4xx        4.77:1          3.07:1              3.75:1         4.56:1          4.77:1
 *   5xx/failed 4.83:1          3.03:1              3.70:1         4.62:1          4.83:1
 * ```
 *
 * The fix is a genuinely narrow target, not a simple "pick a darker shade": because the dark theme's
 * `surface` sits at very low luminance, a fill has to be simultaneously light enough to clear 4.5:1
 * against white text and dark enough to clear 3:1 against that near-black surface — a band that lands
 * strictly between each hue's stock Tailwind 600 and 700 shade. Hue families with more green content
 * (green, emerald, cyan, amber all weight WCAG's luminance-heavy green channel more than red does)
 * have no *stock* 600 or 700 shade inside that band — 600 is too light, 700 is too dark, and every
 * shade in between was checked and skipped. `emerald660` / `cyan670` / `amber690`
 * (`shared-tokens/src/primitives.ts`) are hand-tuned values for exactly that reason. `red600` and the
 * now-fixed `slate500` (`1xx`) land inside the band without needing a custom shade — hue families with
 * less green content do so naturally.
 *
 * This table's fills are unchanged by whichever request is selected/highlighted — see
 * `NetworkPane.tsx`'s `border-[var(--bc-accent)]` / `bg-[var(--bc-surface)]` row treatment for that.
 */
export const STATUS_CLASS_COLOR: Record<string, string> = {
  '1xx': NEUTRAL_FILL_COLOR,
  '2xx': palette.emerald660,
  '3xx': palette.cyan670,
  '4xx': palette.amber690,
  '5xx': palette.red600,
  [FAILED_CLASS]: palette.red600,
};

/** Color for a status class, falling back to the neutral `1xx`/muted color for anything unmapped. */
export function statusClassColor(cls: string): string {
  return STATUS_CLASS_COLOR[cls] ?? NEUTRAL_FILL_COLOR;
}

/**
 * Semantic status-class colors for plain TEXT sitting directly on the pane's `--bc-bg`/`--bc-surface`
 * (`NetworkPane.tsx`'s row and detail-panel status text) — the S4-27 Task 15 axe gate caught this
 * exact pair using {@link STATUS_CLASS_COLOR}'s fixed `5xx` literal (`#dc2626`, tuned for a light
 * background) at 3.70:1 on the dark theme's `--bc-bg` (`#0f172a`), below the 4.5:1 floor. Unlike the
 * fill colors above, page text MUST flip with the theme, so this reuses the already contrast-audited
 * `--bc-success` / `--bc-accent` / `--bc-warning` / `--bc-danger` roles — `contrast.test.ts`'s MATRIX
 * proves each is ≥4.5:1 on both `bg` and `surface`, in both themes — rather than a second set of fixed
 * literals.
 */
export const STATUS_CLASS_TEXT_COLOR: Record<string, string> = {
  '1xx': NEUTRAL_TEXT_COLOR,
  '2xx': 'var(--bc-success)',
  '3xx': 'var(--bc-accent)',
  '4xx': 'var(--bc-warning)',
  '5xx': 'var(--bc-danger)',
  [FAILED_CLASS]: 'var(--bc-danger)',
};

/** Text color for a status class, falling back to the neutral `1xx`/muted color for anything unmapped. */
export function statusClassTextColor(cls: string): string {
  return STATUS_CLASS_TEXT_COLOR[cls] ?? NEUTRAL_TEXT_COLOR;
}

export interface WaterfallProps {
  /** Milliseconds from the capture's earliest request to this request's start. */
  readonly startOffsetMs: number;
  /** Request duration; null when it failed or produced no timing. */
  readonly durationMs: number | null;
  /** Total captured range in ms (max end − min start); 0 renders an empty track. */
  readonly totalMs: number;
  /** Status class (`2xx`, `failed`, …) driving the bar color. */
  readonly cls: string;
  /** Accessible description of the timing, e.g. `"200 ms"` or `"failed"`. */
  readonly label: string;
}

/**
 * A single request's inline waterfall bar. Renders as a fixed-viewBox SVG stretched to the column
 * width (`preserveAspectRatio="none"`), so {@link barGeometry}'s percentages map straight to
 * coordinates. A faint full-width track sits behind the colored bar (or a thin tick for a marker).
 */
export function Waterfall({ startOffsetMs, durationMs, totalMs, cls, label }: WaterfallProps) {
  const { xPct, widthPct } = barGeometry(startOffsetMs, durationMs, totalMs);
  const color = statusClassColor(cls);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      className="h-3 w-full"
    >
      <rect x={0} y={4} width={100} height={2} className="fill-[var(--bc-border)]" opacity={0.5} />
      {widthPct > 0 ? (
        <rect x={xPct} y={2} width={widthPct} height={6} rx={1} style={{ fill: color }} />
      ) : (
        <rect x={xPct} y={1} width={0.8} height={8} style={{ fill: color }} />
      )}
    </svg>
  );
}
