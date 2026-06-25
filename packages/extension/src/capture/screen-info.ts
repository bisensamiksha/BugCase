/**
 * Screen + zoom info collector (S2-19).
 *
 * Builds the report's viewport metadata — screen size, device pixel ratio, window dimensions, and a
 * page-zoom estimate — from a snapshot of the page's window/screen globals. Extracted from the S1-11
 * metadata collector (which now delegates here) so the screen/zoom logic is small, pure, and
 * thoroughly tested. Zoom is estimated from the window-chrome ratio (outerWidth/innerWidth), which
 * grows with page zoom because innerWidth shrinks in CSS pixels as the user zooms in; the raw ratio
 * is rounded and clamped to a sane range rather than snapped, so it never claims more precision than
 * the signal supports. Pure and dependency-injected (the caller supplies the snapshot), so it is
 * unit-testable without a DOM.
 */

import type { ViewportMetadata } from '@bugcase/schema';

/** The window/screen globals the screen+zoom collector needs (a subset of MetadataSource). */
export interface ScreenInfoSource {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly outerWidth: number;
  readonly outerHeight: number;
  readonly devicePixelRatio: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly orientation: string | null;
}

/** Clamp bounds for the zoom estimate; outside this range the ratio is treated as noise. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;

function nonNegInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function positive(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Estimate page zoom from the window-chrome ratio (outerWidth/innerWidth), rounded to 2 decimals and
 * clamped to [{@link ZOOM_MIN}, {@link ZOOM_MAX}]. Falls back to 1 when either width is unavailable.
 */
export function estimateZoom(source: ScreenInfoSource): number {
  if (source.innerWidth > 0 && source.outerWidth > 0) {
    return clamp(round2(source.outerWidth / source.innerWidth), ZOOM_MIN, ZOOM_MAX);
  }
  return 1;
}

/** Build the report's {@link ViewportMetadata} from a window/screen globals snapshot. */
export function collectScreenInfo(source: ScreenInfoSource): ViewportMetadata {
  return {
    innerWidth: nonNegInt(source.innerWidth),
    innerHeight: nonNegInt(source.innerHeight),
    outerWidth: nonNegInt(source.outerWidth),
    outerHeight: nonNegInt(source.outerHeight),
    devicePixelRatio: positive(source.devicePixelRatio),
    zoomEstimate: estimateZoom(source),
    screenWidth: nonNegInt(source.screenWidth),
    screenHeight: nonNegInt(source.screenHeight),
    orientation: source.orientation,
  };
}
