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

/** Semantic status-class colors, shared by the bars, chips, and status text so they stay consistent. */
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
