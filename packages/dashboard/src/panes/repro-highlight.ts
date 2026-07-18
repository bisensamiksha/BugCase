import type { ReproductionStep } from '@bugcase/schema';

/**
 * Pure playback model for the Reproduction pane's play-highlight mode (S4-10). No React and no
 * timers — the pane owns the single `setTimeout`; these transitions make the behavior (resume,
 * restart-from-end, auto-stop, select-pauses) unit-testable without a fake clock.
 */

export interface PlaybackState {
  readonly activeIndex: number | null;
  readonly playing: boolean;
}

export const INITIAL_PLAYBACK: PlaybackState = { activeIndex: null, playing: false };

/** Auto-advance uses the real recorded gap, clamped so playback never crawls or blurs. */
export const MIN_ADVANCE_MS = 400;
export const MAX_ADVANCE_MS = 2500;
export const DEFAULT_ADVANCE_MS = 1000;

/** Play from the active step; from nothing or the last step, restart at the first. */
export function startPlayback(state: PlaybackState, stepCount: number): PlaybackState {
  if (stepCount === 0) {
    return state;
  }
  const atEnd = state.activeIndex === null || state.activeIndex >= stepCount - 1;
  return { activeIndex: atEnd ? 0 : state.activeIndex, playing: true };
}

export function pausePlayback(state: PlaybackState): PlaybackState {
  return { ...state, playing: false };
}

/** One timer tick: move to the next step; reaching the last step stops playback on it. */
export function advancePlayback(state: PlaybackState, stepCount: number): PlaybackState {
  if (state.activeIndex === null || stepCount === 0) {
    return { ...state, playing: false };
  }
  const next = Math.min(state.activeIndex + 1, stepCount - 1);
  return { activeIndex: next, playing: next < stepCount - 1 };
}

/** Manual Next: clamps at the end, preserves `playing`; from nothing selects the first step. */
export function stepForward(state: PlaybackState, stepCount: number): PlaybackState {
  if (stepCount === 0) {
    return state;
  }
  const current = state.activeIndex ?? -1;
  return { ...state, activeIndex: Math.min(current + 1, stepCount - 1) };
}

/** Manual Prev: clamps at the start, preserves `playing`; from nothing selects the last step. */
export function stepBackward(state: PlaybackState, stepCount: number): PlaybackState {
  if (stepCount === 0) {
    return state;
  }
  const current = state.activeIndex ?? stepCount;
  return { ...state, activeIndex: Math.max(current - 1, 0) };
}

/** Clicking a row: make it active and pause — the user is reading, not watching. */
export function selectStep(state: PlaybackState, index: number, stepCount: number): PlaybackState {
  if (stepCount === 0) {
    return state;
  }
  return { activeIndex: Math.min(Math.max(index, 0), stepCount - 1), playing: false };
}

/** Timer delay before leaving `index`: the real recorded gap clamped; bad data → default. */
export function advanceDelayMs(steps: readonly ReproductionStep[], index: number): number {
  const current = steps[index];
  const next = steps[index + 1];
  if (current === undefined || next === undefined) {
    return DEFAULT_ADVANCE_MS;
  }
  const a = Date.parse(current.timestamp);
  const b = Date.parse(next.timestamp);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) {
    return DEFAULT_ADVANCE_MS;
  }
  return Math.min(Math.max(b - a, MIN_ADVANCE_MS), MAX_ADVANCE_MS);
}
