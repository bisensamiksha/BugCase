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

/** Neutral color for `1xx` / unmapped classes. */
const NEUTRAL_COLOR = 'var(--bc-fg-muted)';

/**
 * Semantic status-class colors for solid graphical fills: the waterfall bars below and the network
 * filter chips' active background (`NetworkPane.tsx`, paired with hardcoded white text). Deliberately
 * fixed literals rather than the theme-flipping `--bc-*` status roles — those are tuned as *foreground
 * text on the page background* (light-mode value saturated, dark-mode value pastel, by design; see
 * `shared-tokens/src/themes.ts`), which would fail white-on-chip contrast badly once flipped to the
 * dark-mode pastel shade (e.g. white on `--bc-danger`'s dark value is 2.77:1). A fixed, theme-invariant
 * swatch is correct for a filled shape/chip rather than page text, and each value here already clears
 * 4.5:1 against white in both themes precisely because it never changes.
 */
export const STATUS_CLASS_COLOR: Record<string, string> = {
  '1xx': NEUTRAL_COLOR,
  '2xx': '#16a34a',
  '3xx': '#0891b2',
  '4xx': '#d97706',
  '5xx': '#dc2626',
  [FAILED_CLASS]: '#dc2626',
};

/** Color for a status class, falling back to the neutral `1xx`/muted color for anything unmapped. */
export function statusClassColor(cls: string): string {
  return STATUS_CLASS_COLOR[cls] ?? NEUTRAL_COLOR;
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
  '1xx': NEUTRAL_COLOR,
  '2xx': 'var(--bc-success)',
  '3xx': 'var(--bc-accent)',
  '4xx': 'var(--bc-warning)',
  '5xx': 'var(--bc-danger)',
  [FAILED_CLASS]: 'var(--bc-danger)',
};

/** Text color for a status class, falling back to the neutral `1xx`/muted color for anything unmapped. */
export function statusClassTextColor(cls: string): string {
  return STATUS_CLASS_TEXT_COLOR[cls] ?? NEUTRAL_COLOR;
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
