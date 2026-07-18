import type { ReproductionStep } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ADVANCE_MS,
  INITIAL_PLAYBACK,
  MAX_ADVANCE_MS,
  MIN_ADVANCE_MS,
  advanceDelayMs,
  advancePlayback,
  pausePlayback,
  selectStep,
  startPlayback,
  stepBackward,
  stepForward,
} from './repro-highlight';

const at = (iso: string): ReproductionStep => ({
  id: iso,
  timestamp: iso,
  type: 'click',
  selector: '#x',
  description: 'Clicked',
  metadata: {},
});

describe('playback transitions', () => {
  it('starts at the first step from the initial state', () => {
    expect(startPlayback(INITIAL_PLAYBACK, 3)).toEqual({ activeIndex: 0, playing: true });
  });

  it('resumes from a mid-list step and restarts from the last one', () => {
    expect(startPlayback({ activeIndex: 1, playing: false }, 3)).toEqual({
      activeIndex: 1,
      playing: true,
    });
    expect(startPlayback({ activeIndex: 2, playing: false }, 3)).toEqual({
      activeIndex: 0,
      playing: true,
    });
  });

  it('is a no-op on an empty list', () => {
    expect(startPlayback(INITIAL_PLAYBACK, 0)).toEqual(INITIAL_PLAYBACK);
  });

  it('pause keeps the active step', () => {
    expect(pausePlayback({ activeIndex: 1, playing: true })).toEqual({
      activeIndex: 1,
      playing: false,
    });
  });

  it('advance moves forward and auto-stops on the last step', () => {
    expect(advancePlayback({ activeIndex: 0, playing: true }, 3)).toEqual({
      activeIndex: 1,
      playing: true,
    });
    expect(advancePlayback({ activeIndex: 1, playing: true }, 3)).toEqual({
      activeIndex: 2,
      playing: false,
    });
  });

  it('manual next/prev clamp and preserve the playing flag', () => {
    expect(stepForward({ activeIndex: 2, playing: true }, 3)).toEqual({
      activeIndex: 2,
      playing: true,
    });
    expect(stepForward(INITIAL_PLAYBACK, 3)).toEqual({ activeIndex: 0, playing: false });
    expect(stepBackward({ activeIndex: 0, playing: true }, 3)).toEqual({
      activeIndex: 0,
      playing: true,
    });
    expect(stepBackward(INITIAL_PLAYBACK, 3)).toEqual({ activeIndex: 2, playing: false });
  });

  it('selecting a step pauses playback', () => {
    expect(selectStep({ activeIndex: 0, playing: true }, 2, 3)).toEqual({
      activeIndex: 2,
      playing: false,
    });
  });
});

describe('advanceDelayMs', () => {
  const steps = [
    at('2026-07-18T10:00:00.000Z'),
    at('2026-07-18T10:00:03.000Z'), // 3000 ms gap → clamped to MAX
    at('2026-07-18T10:00:03.100Z'), // 100 ms gap → clamped to MIN
    at('2026-07-18T10:00:04.100Z'), // 1000 ms gap → passes through
  ];

  it('clamps the real gap into [MIN, MAX] and passes in-range gaps through', () => {
    expect(advanceDelayMs(steps, 0)).toBe(MAX_ADVANCE_MS);
    expect(advanceDelayMs(steps, 1)).toBe(MIN_ADVANCE_MS);
    expect(advanceDelayMs(steps, 2)).toBe(1000);
  });

  it('falls back to the default for missing neighbors or bad timestamps', () => {
    expect(advanceDelayMs(steps, 3)).toBe(DEFAULT_ADVANCE_MS); // last step
    expect(advanceDelayMs([at('bad'), at('2026-07-18T10:00:00.000Z')], 0)).toBe(DEFAULT_ADVANCE_MS);
    expect(
      advanceDelayMs([at('2026-07-18T10:00:03.000Z'), at('2026-07-18T10:00:00.000Z')], 0),
    ).toBe(DEFAULT_ADVANCE_MS); // negative gap
  });
});
