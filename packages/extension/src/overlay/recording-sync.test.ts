import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  RECORDING_APPEND,
  RECORDING_CLEAR,
  RECORDING_START,
  RECORDING_STOP,
} from '../background/recording-handler';
import type { RecordingSession } from '../storage/recording-session';

import {
  appendRecordingStep,
  clearRecording,
  getRecording,
  startRecording,
  stopRecording,
  wasInterruptedByNavigation,
} from './recording-sync';

describe('recording-sync client', () => {
  it('startRecording sends a RECORDING_START with the time + url', async () => {
    const send = vi.fn(() => Promise.resolve({ ok: true }));
    await startRecording('2026-07-05T10:00:00.000Z', 'https://a.test/', send);
    expect(send).toHaveBeenCalledWith({
      type: RECORDING_START,
      startedAt: '2026-07-05T10:00:00.000Z',
      url: 'https://a.test/',
    });
  });

  it('appendRecordingStep sends a RECORDING_APPEND with the step', async () => {
    const send = vi.fn(() => Promise.resolve({ ok: true }));
    const step = { type: 'click', selector: '#x' };
    await appendRecordingStep(step, send);
    expect(send).toHaveBeenCalledWith({ type: RECORDING_APPEND, step });
  });

  it('stopRecording sends a RECORDING_STOP with endedAt', async () => {
    const send = vi.fn(() => Promise.resolve({ ok: true }));
    await stopRecording('2026-07-05T10:01:00.000Z', send);
    expect(send).toHaveBeenCalledWith({
      type: RECORDING_STOP,
      endedAt: '2026-07-05T10:01:00.000Z',
    });
  });

  it('getRecording returns the session from the response', async () => {
    const session: RecordingSession = {
      status: 'stopped',
      startedAt: '2026-07-05T10:00:00.000Z',
      endedAt: '2026-07-05T10:01:00.000Z',
      url: 'https://a.test/',
      steps: [],
    };
    const send = vi.fn(() => Promise.resolve({ ok: true, session }));
    expect(await getRecording(send)).toEqual(session);
  });

  it('getRecording returns null on a failed/empty response', async () => {
    expect(await getRecording(vi.fn(() => Promise.resolve({ ok: false })))).toBeNull();
    expect(await getRecording(vi.fn(() => Promise.reject(new Error('x'))))).toBeNull();
  });

  it('clearRecording sends a RECORDING_CLEAR', async () => {
    const send = vi.fn(() => Promise.resolve({ ok: true }));
    await clearRecording(send);
    expect(send).toHaveBeenCalledWith({ type: RECORDING_CLEAR });
  });

  it('never throws when a send rejects', async () => {
    const send = vi.fn(() => Promise.reject(new Error('no receiver')));
    await expect(startRecording('t', 'u', send)).resolves.toBeUndefined();
    await expect(appendRecordingStep({}, send)).resolves.toBeUndefined();
  });
});

describe('wasInterruptedByNavigation', () => {
  const base: RecordingSession = {
    status: 'recording',
    startedAt: '2026-07-05T10:00:00.000Z',
    endedAt: null,
    url: 'https://a.test/page1',
    steps: [],
  };

  it('is true for a still-recording session on a different url', () => {
    expect(wasInterruptedByNavigation(base, 'https://a.test/page2')).toBe(true);
  });

  it('is false on the same url', () => {
    expect(wasInterruptedByNavigation(base, 'https://a.test/page1')).toBe(false);
  });

  it('is false for an already-stopped session', () => {
    expect(wasInterruptedByNavigation({ ...base, status: 'stopped' }, 'https://a.test/page2')).toBe(
      false,
    );
  });
});
