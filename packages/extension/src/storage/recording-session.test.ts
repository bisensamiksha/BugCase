import { describe, expect, it, vi } from 'vitest';

// The storage area is injected in every test, but importing lib/browser pulls in the polyfill; stub it.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  clearRecordingSession,
  getRecordingSession,
  saveRecordingSession,
  type RecordingSession,
  type RecordingStorageArea,
} from './recording-session';

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

const SESSION: RecordingSession = {
  status: 'recording',
  startedAt: '2026-07-05T10:00:00.000Z',
  endedAt: null,
  url: 'https://example.com/a',
  steps: [{ type: 'click', selector: '#x', description: 'Clicked #x', timestamp: 1, metadata: {} }],
};

describe('recording-session storage', () => {
  it('round-trips a saved session for a tab', async () => {
    const storage = fakeStorage();
    await saveRecordingSession(7, SESSION, { storage });
    expect(await getRecordingSession(7, { storage })).toEqual(SESSION);
  });

  it('returns null when no session exists for the tab', async () => {
    expect(await getRecordingSession(7, { storage: fakeStorage() })).toBeNull();
  });

  it('keeps sessions for different tabs independent', async () => {
    const storage = fakeStorage();
    await saveRecordingSession(1, SESSION, { storage });
    await saveRecordingSession(2, { ...SESSION, url: 'https://example.com/b' }, { storage });
    expect((await getRecordingSession(2, { storage }))?.url).toBe('https://example.com/b');
    expect((await getRecordingSession(1, { storage }))?.url).toBe('https://example.com/a');
  });

  it('clears a session', async () => {
    const storage = fakeStorage();
    await saveRecordingSession(7, SESSION, { storage });
    await clearRecordingSession(7, { storage });
    expect(await getRecordingSession(7, { storage })).toBeNull();
  });

  it('returns null for a malformed stored blob instead of throwing', async () => {
    const storage = fakeStorage();
    storage.data['bugcase/recording:7'] = { nonsense: true };
    expect(await getRecordingSession(7, { storage })).toBeNull();
  });

  it('normalizes a missing endedAt/steps defensively', async () => {
    const storage = fakeStorage();
    storage.data['bugcase/recording:7'] = {
      status: 'stopped',
      startedAt: '2026-07-05T10:00:00.000Z',
      url: 'https://example.com/a',
    };
    const session = await getRecordingSession(7, { storage });
    expect(session).toEqual({
      status: 'stopped',
      startedAt: '2026-07-05T10:00:00.000Z',
      endedAt: null,
      url: 'https://example.com/a',
      steps: [],
    });
  });
});
