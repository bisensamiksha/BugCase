import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { RecordingStorageArea } from '../storage/recording-session';

import {
  RECORDING_APPEND,
  RECORDING_CLEAR,
  RECORDING_GET,
  RECORDING_START,
  RECORDING_STOP,
  handleRecordingRequest,
  isRecordingRequest,
} from './recording-handler';

function fakeStorage(): RecordingStorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: (key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (items: Record<string, unknown>) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
    remove: (key: string) => {
      delete data[key];
      return Promise.resolve();
    },
  };
}

const step = {
  type: 'click',
  selector: '#x',
  description: 'Clicked #x',
  timestamp: 1,
  metadata: {},
};

describe('isRecordingRequest', () => {
  it('accepts the recording messages and rejects others', () => {
    expect(isRecordingRequest({ type: RECORDING_GET })).toBe(true);
    expect(isRecordingRequest({ type: 'bugcase/capture-report' })).toBe(false);
    expect(isRecordingRequest(null)).toBe(false);
  });
});

describe('handleRecordingRequest', () => {
  it('starts, appends, and reads back a recording for the tab', async () => {
    const storage = fakeStorage();
    await handleRecordingRequest(
      { type: RECORDING_START, startedAt: '2026-07-05T10:00:00.000Z', url: 'https://a.test/' },
      7,
      { storage },
    );
    await handleRecordingRequest({ type: RECORDING_APPEND, step }, 7, { storage });

    const res = await handleRecordingRequest({ type: RECORDING_GET }, 7, { storage });
    expect(res.ok).toBe(true);
    expect(res.session?.status).toBe('recording');
    expect(res.session?.steps).toHaveLength(1);
  });

  it('does not append to a non-recording session', async () => {
    const storage = fakeStorage();
    const res = await handleRecordingRequest({ type: RECORDING_APPEND, step }, 7, { storage });
    expect(res.ok).toBe(false);
    expect(
      (await handleRecordingRequest({ type: RECORDING_GET }, 7, { storage })).session,
    ).toBeNull();
  });

  it('stops a recording, setting status + endedAt but keeping steps', async () => {
    const storage = fakeStorage();
    await handleRecordingRequest(
      { type: RECORDING_START, startedAt: '2026-07-05T10:00:00.000Z', url: 'https://a.test/' },
      7,
      { storage },
    );
    await handleRecordingRequest({ type: RECORDING_APPEND, step }, 7, { storage });
    await handleRecordingRequest({ type: RECORDING_STOP, endedAt: '2026-07-05T10:01:00.000Z' }, 7, {
      storage,
    });
    const res = await handleRecordingRequest({ type: RECORDING_GET }, 7, { storage });
    expect(res.session?.status).toBe('stopped');
    expect(res.session?.endedAt).toBe('2026-07-05T10:01:00.000Z');
    expect(res.session?.steps).toHaveLength(1);
    // Appending after stop is ignored.
    await handleRecordingRequest({ type: RECORDING_APPEND, step }, 7, { storage });
    expect(
      (await handleRecordingRequest({ type: RECORDING_GET }, 7, { storage })).session?.steps,
    ).toHaveLength(1);
  });

  it('clears a recording', async () => {
    const storage = fakeStorage();
    await handleRecordingRequest(
      { type: RECORDING_START, startedAt: '2026-07-05T10:00:00.000Z', url: 'https://a.test/' },
      7,
      { storage },
    );
    await handleRecordingRequest({ type: RECORDING_CLEAR }, 7, { storage });
    expect(
      (await handleRecordingRequest({ type: RECORDING_GET }, 7, { storage })).session,
    ).toBeNull();
  });

  it('fails cleanly when there is no tab id', async () => {
    const res = await handleRecordingRequest({ type: RECORDING_GET }, undefined, {
      storage: fakeStorage(),
    });
    expect(res.ok).toBe(false);
  });
});
