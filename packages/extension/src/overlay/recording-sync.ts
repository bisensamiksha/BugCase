/**
 * Overlay-side client for the durable reproduction recording (S3-12, Part B).
 *
 * The overlay (isolated world) can't reach `chrome.storage.session`, so it relays the recording
 * lifecycle to the service worker, which persists it (recording-handler.ts / recording-session.ts).
 * Every call is best-effort — a failed relay must never break the recording UX.
 */

import {
  RECORDING_APPEND,
  RECORDING_CLEAR,
  RECORDING_GET,
  RECORDING_START,
  RECORDING_STOP,
  type RecordingRequest,
  type RecordingResponse,
} from '../background/recording-handler';
import browser from '../lib/browser';
import type { RecordedStep, RecordingSession } from '../storage/recording-session';

export type RecordingSendFn = (message: RecordingRequest) => Promise<RecordingResponse>;

function defaultSend(message: RecordingRequest): Promise<RecordingResponse> {
  return browser.runtime.sendMessage<RecordingRequest, RecordingResponse>(message);
}

async function relay(message: RecordingRequest, send: RecordingSendFn): Promise<RecordingResponse> {
  try {
    return await send(message);
  } catch {
    return { ok: false };
  }
}

export async function startRecording(
  startedAt: string,
  url: string,
  send: RecordingSendFn = defaultSend,
): Promise<void> {
  await relay({ type: RECORDING_START, startedAt, url }, send);
}

export async function appendRecordingStep(
  step: RecordedStep,
  send: RecordingSendFn = defaultSend,
): Promise<void> {
  await relay({ type: RECORDING_APPEND, step }, send);
}

export async function stopRecording(
  endedAt: string,
  send: RecordingSendFn = defaultSend,
): Promise<void> {
  await relay({ type: RECORDING_STOP, endedAt }, send);
}

export async function getRecording(
  send: RecordingSendFn = defaultSend,
): Promise<RecordingSession | null> {
  const response = await relay({ type: RECORDING_GET }, send);
  return response.ok ? (response.session ?? null) : null;
}

export async function clearRecording(send: RecordingSendFn = defaultSend): Promise<void> {
  await relay({ type: RECORDING_CLEAR }, send);
}

/** Whether a fetched session's recording was cut short by a navigation (still 'recording' elsewhere). */
export function wasInterruptedByNavigation(session: RecordingSession, currentUrl: string): boolean {
  return session.status === 'recording' && session.url !== currentUrl;
}
