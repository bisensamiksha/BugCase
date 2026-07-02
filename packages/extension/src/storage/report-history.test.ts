import { describe, expect, it, vi } from 'vitest';

// The module transitively imports lib/browser; stub the polyfill so the import succeeds in node.
// Every test injects a fake storage area, so the real browser.storage is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  MAX_HISTORY_ENTRIES,
  REPORT_HISTORY_STORAGE_KEY,
  appendReportHistory,
  clearReportHistory,
  getReportHistory,
  removeReportHistory,
  type ReportHistoryEntry,
} from './report-history';
import type { SettingsStorageArea } from './settings';

function fakeStorage(initial: Record<string, unknown> = {}): SettingsStorageArea & {
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: (key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (items: Record<string, unknown>) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
  };
}

const rejectingStorage: SettingsStorageArea = {
  get: () => Promise.reject(new Error('nope')),
  set: () => Promise.reject(new Error('nope')),
};

function entry(overrides: Partial<ReportHistoryEntry> = {}): ReportHistoryEntry {
  return {
    id: 'cap-1',
    capturedAt: '2026-07-02T10:00:00.000Z',
    url: 'https://example.com/page',
    title: 'Example page',
    origin: 'https://example.com',
    filename: 'bugcase-example-com-20260702-100000.zip',
    byteSize: 12_345,
    artifacts: ['screenshot', 'metadata'],
    downloadId: 7,
    toolVersion: '0.1.0',
    ...overrides,
  };
}

describe('getReportHistory', () => {
  it('returns an empty list when storage is empty', async () => {
    expect(await getReportHistory({ storage: fakeStorage() })).toEqual([]);
  });

  it('returns stored entries newest-first', async () => {
    const stored = [entry({ id: 'b' }), entry({ id: 'a' })];
    const storage = fakeStorage({ [REPORT_HISTORY_STORAGE_KEY]: stored });
    const history = await getReportHistory({ storage });
    expect(history.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('drops malformed entries without throwing', async () => {
    const storage = fakeStorage({
      [REPORT_HISTORY_STORAGE_KEY]: [
        entry({ id: 'ok' }),
        { id: '' },
        null,
        'nope',
        { id: 'no-fields' },
      ],
    });
    const history = await getReportHistory({ storage });
    expect(history.map((e) => e.id)).toEqual(['ok', 'no-fields']);
  });

  it('coerces a malformed downloadId to null', async () => {
    const storage = fakeStorage({
      [REPORT_HISTORY_STORAGE_KEY]: [entry({ id: 'x', downloadId: 'not-a-number' as never })],
    });
    const [only] = await getReportHistory({ storage });
    expect(only!.downloadId).toBeNull();
  });

  it('returns an empty list when the read rejects', async () => {
    expect(await getReportHistory({ storage: rejectingStorage })).toEqual([]);
  });
});

describe('appendReportHistory', () => {
  it('prepends the new entry (newest-first) and persists it', async () => {
    const storage = fakeStorage({ [REPORT_HISTORY_STORAGE_KEY]: [entry({ id: 'old' })] });
    const next = await appendReportHistory(entry({ id: 'new' }), { storage });
    expect(next.map((e) => e.id)).toEqual(['new', 'old']);

    const reread = await getReportHistory({ storage });
    expect(reread.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('de-dupes by id, moving a re-downloaded capture to the front', async () => {
    const storage = fakeStorage({
      [REPORT_HISTORY_STORAGE_KEY]: [entry({ id: 'b' }), entry({ id: 'a' })],
    });
    const next = await appendReportHistory(entry({ id: 'a', byteSize: 999 }), { storage });
    expect(next.map((e) => e.id)).toEqual(['a', 'b']);
    expect(next[0]!.byteSize).toBe(999);
  });

  it('caps the list at MAX_HISTORY_ENTRIES, evicting the oldest', async () => {
    const stored = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, i) => entry({ id: `e${i}` }));
    const storage = fakeStorage({ [REPORT_HISTORY_STORAGE_KEY]: stored });
    const next = await appendReportHistory(entry({ id: 'newest' }), { storage });
    expect(next).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(next[0]!.id).toBe('newest');
    // the previously-oldest entry (e{MAX-1}) is evicted
    expect(next.map((e) => e.id)).not.toContain(`e${MAX_HISTORY_ENTRIES - 1}`);
  });

  it('returns the current list unchanged when the write rejects', async () => {
    const next = await appendReportHistory(entry({ id: 'new' }), { storage: rejectingStorage });
    expect(next).toEqual([]);
  });
});

describe('removeReportHistory', () => {
  it('removes the entry with the given id', async () => {
    const storage = fakeStorage({
      [REPORT_HISTORY_STORAGE_KEY]: [entry({ id: 'a' }), entry({ id: 'b' })],
    });
    const next = await removeReportHistory('a', { storage });
    expect(next.map((e) => e.id)).toEqual(['b']);
    expect((await getReportHistory({ storage })).map((e) => e.id)).toEqual(['b']);
  });
});

describe('clearReportHistory', () => {
  it('empties the history', async () => {
    const storage = fakeStorage({ [REPORT_HISTORY_STORAGE_KEY]: [entry({ id: 'a' })] });
    await clearReportHistory({ storage });
    expect(await getReportHistory({ storage })).toEqual([]);
  });
});
