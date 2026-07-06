import { describe, expect, it } from 'vitest';

import {
  REPRODUCTION_SESSION_INITIAL,
  hasRecording,
  reproductionSessionReducer,
} from './reproduction-session';

const A = '2026-07-04T10:00:00.000Z';
const B = '2026-07-04T10:00:30.000Z';

describe('reproductionSessionReducer', () => {
  it('starts idle', () => {
    expect(REPRODUCTION_SESSION_INITIAL.status).toBe('idle');
    expect(hasRecording(REPRODUCTION_SESSION_INITIAL)).toBe(false);
  });

  it('start → recording with the token and startedAt', () => {
    const state = reproductionSessionReducer(REPRODUCTION_SESSION_INITIAL, {
      type: 'start',
      token: 'tok',
      at: A,
    });
    expect(state).toEqual({
      status: 'recording',
      sessionToken: 'tok',
      startedAt: A,
      endedAt: null,
    });
  });

  it('stop → recorded, keeping token/startedAt and setting endedAt', () => {
    const recording = reproductionSessionReducer(REPRODUCTION_SESSION_INITIAL, {
      type: 'start',
      token: 'tok',
      at: A,
    });
    const state = reproductionSessionReducer(recording, { type: 'stop', at: B });
    expect(state).toEqual({ status: 'recorded', sessionToken: 'tok', startedAt: A, endedAt: B });
    expect(hasRecording(state)).toBe(true);
  });

  it('ignores stop when not recording', () => {
    const state = reproductionSessionReducer(REPRODUCTION_SESSION_INITIAL, { type: 'stop', at: B });
    expect(state).toBe(REPRODUCTION_SESSION_INITIAL);
  });

  it('reset returns to the initial state', () => {
    const recording = reproductionSessionReducer(REPRODUCTION_SESSION_INITIAL, {
      type: 'start',
      token: 'tok',
      at: A,
    });
    expect(reproductionSessionReducer(recording, { type: 'reset' })).toEqual(
      REPRODUCTION_SESSION_INITIAL,
    );
  });

  it('start over a completed recording begins a fresh session', () => {
    let state = reproductionSessionReducer(REPRODUCTION_SESSION_INITIAL, {
      type: 'start',
      token: 'tok1',
      at: A,
    });
    state = reproductionSessionReducer(state, { type: 'stop', at: B });
    state = reproductionSessionReducer(state, { type: 'start', token: 'tok2', at: B });
    expect(state).toEqual({
      status: 'recording',
      sessionToken: 'tok2',
      startedAt: B,
      endedAt: null,
    });
  });

  it('restores a recovered recording to the recorded state', () => {
    const state = reproductionSessionReducer(REPRODUCTION_SESSION_INITIAL, {
      type: 'restore',
      startedAt: A,
      endedAt: B,
    });
    expect(state).toEqual({ status: 'recorded', sessionToken: null, startedAt: A, endedAt: B });
    expect(hasRecording(state)).toBe(true);
  });

  it('hasRecording is true only for a completed session', () => {
    const recording = reproductionSessionReducer(REPRODUCTION_SESSION_INITIAL, {
      type: 'start',
      token: 'tok',
      at: A,
    });
    expect(hasRecording(recording)).toBe(false);
  });
});
