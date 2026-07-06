/**
 * Service-worker message handlers for the durable reproduction recording (S3-12, Part B).
 *
 * The overlay runs in a page's isolated world and can't reach `chrome.storage.session`, so it relays
 * recording lifecycle over these messages and the worker persists it (recording-session.ts). Keyed by
 * the sender's tab, so a recording survives navigations within that tab.
 */

import {
  clearRecordingSession,
  getRecordingSession,
  saveRecordingSession,
  type RecordedStep,
  type RecordingSession,
  type RecordingSessionDeps,
} from '../storage/recording-session';

export const RECORDING_START = 'bugcase/recording-start';
export const RECORDING_APPEND = 'bugcase/recording-append';
export const RECORDING_STOP = 'bugcase/recording-stop';
export const RECORDING_GET = 'bugcase/recording-get';
export const RECORDING_CLEAR = 'bugcase/recording-clear';

export interface RecordingStartRequest {
  readonly type: typeof RECORDING_START;
  readonly startedAt: string;
  readonly url: string;
}
export interface RecordingAppendRequest {
  readonly type: typeof RECORDING_APPEND;
  readonly step: RecordedStep;
}
export interface RecordingStopRequest {
  readonly type: typeof RECORDING_STOP;
  readonly endedAt: string;
}
export interface RecordingGetRequest {
  readonly type: typeof RECORDING_GET;
}
export interface RecordingClearRequest {
  readonly type: typeof RECORDING_CLEAR;
}

export type RecordingRequest =
  | RecordingStartRequest
  | RecordingAppendRequest
  | RecordingStopRequest
  | RecordingGetRequest
  | RecordingClearRequest;

export interface RecordingResponse {
  readonly ok: boolean;
  readonly session?: RecordingSession | null;
}

const RECORDING_TYPES = new Set<string>([
  RECORDING_START,
  RECORDING_APPEND,
  RECORDING_STOP,
  RECORDING_GET,
  RECORDING_CLEAR,
]);

export function isRecordingRequest(value: unknown): value is RecordingRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    RECORDING_TYPES.has((value as { type?: unknown }).type as string)
  );
}

export async function handleRecordingRequest(
  message: RecordingRequest,
  tabId: number | undefined,
  deps: RecordingSessionDeps = {},
): Promise<RecordingResponse> {
  if (tabId === undefined) {
    return { ok: false };
  }
  switch (message.type) {
    case RECORDING_START:
      await saveRecordingSession(
        tabId,
        {
          status: 'recording',
          startedAt: message.startedAt,
          endedAt: null,
          url: message.url,
          steps: [],
        },
        deps,
      );
      return { ok: true };
    case RECORDING_APPEND: {
      const session = await getRecordingSession(tabId, deps);
      if (!session || session.status !== 'recording') {
        return { ok: false };
      }
      await saveRecordingSession(
        tabId,
        { ...session, steps: [...session.steps, message.step] },
        deps,
      );
      return { ok: true };
    }
    case RECORDING_STOP: {
      const session = await getRecordingSession(tabId, deps);
      if (!session) {
        return { ok: false };
      }
      await saveRecordingSession(
        tabId,
        { ...session, status: 'stopped', endedAt: message.endedAt },
        deps,
      );
      return { ok: true };
    }
    case RECORDING_GET:
      return { ok: true, session: await getRecordingSession(tabId, deps) };
    case RECORDING_CLEAR:
      await clearRecordingSession(tabId, deps);
      return { ok: true };
  }
}
