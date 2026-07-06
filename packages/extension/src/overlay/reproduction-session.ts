/**
 * Reproduction recording session state (S3-12).
 *
 * The pure core behind the overlay's Start/Stop controls: a tiny `idle → recording → recorded` state
 * machine that owns the session token (relayed to the MAIN-world recorder to arm/disarm it) and the
 * ISO start/end timestamps that bound the recording. No React, no browser — unit-testable in isolation;
 * the component supplies the token and timestamps so the reducer stays pure.
 */

export type ReproductionSessionStatus = 'idle' | 'recording' | 'recorded';

export interface ReproductionSessionState {
  readonly status: ReproductionSessionStatus;
  /** Random per-session token; the recorder only disarms for the token it was armed with. */
  readonly sessionToken: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

export const REPRODUCTION_SESSION_INITIAL: ReproductionSessionState = {
  status: 'idle',
  sessionToken: null,
  startedAt: null,
  endedAt: null,
};

export type ReproductionSessionAction =
  | { readonly type: 'start'; readonly token: string; readonly at: string }
  | { readonly type: 'stop'; readonly at: string }
  | { readonly type: 'restore'; readonly startedAt: string; readonly endedAt: string }
  | { readonly type: 'reset' };

/** Pure reducer over the recording session; never mutates `state`. */
export function reproductionSessionReducer(
  state: ReproductionSessionState,
  action: ReproductionSessionAction,
): ReproductionSessionState {
  switch (action.type) {
    case 'start':
      return {
        status: 'recording',
        sessionToken: action.token,
        startedAt: action.at,
        endedAt: null,
      };
    case 'stop':
      if (state.status !== 'recording') {
        return state;
      }
      return { ...state, status: 'recorded', endedAt: action.at };
    case 'restore':
      // A recording recovered from durable storage on a fresh page (e.g. after a navigation).
      return {
        status: 'recorded',
        sessionToken: null,
        startedAt: action.startedAt,
        endedAt: action.endedAt,
      };
    case 'reset':
      return REPRODUCTION_SESSION_INITIAL;
  }
}

/** Whether the session holds a completed recording ready to attach to a capture. */
export function hasRecording(state: ReproductionSessionState): boolean {
  return state.status === 'recorded';
}
