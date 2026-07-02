/**
 * Preset color + stroke-width choices for the annotation canvas (S3-09). Kept as plain data so the picker
 * UI and any invariant tests share one source of truth. Includes the reducer defaults (`DEFAULT_COLOR`,
 * `DEFAULT_STROKE_WIDTH`) so the initial selection is always highlighted.
 */

/** 8 preset annotation colors (red, orange, yellow, green, blue, purple, near-black, white). */
export const PRESET_COLORS: readonly string[] = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#0f172a',
  '#ffffff',
];

/** 3 preset stroke widths (thin / medium / thick), ascending. */
export const STROKE_WIDTHS: readonly number[] = [2, 4, 8];
