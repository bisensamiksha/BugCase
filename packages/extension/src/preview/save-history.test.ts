import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import { REPORT_HISTORY_STORAGE_KEY, getReportHistory } from '../storage/report-history';
import type { SettingsStorageArea } from '../storage/settings';

import { buildHistoryEntry, saveDownloadedReport } from './save-history';

function makeReport(): BugReportV1 {
  return {
    schemaVersion: 'v1',
    metadata: {
      id: 'cap-123',
      tool: {
        name: 'bugcase',
        version: '0.9.0',
        schemaVersion: 'v1',
        browserBuildTarget: 'chrome',
      },
      page: {
        url: 'https://example.com/bug',
        title: 'Bug page',
        origin: 'https://example.com',
        capturedAt: '2026-07-02T09:08:07.000Z',
        referrer: null,
      },
    },
    userInput: {
      schemaVersion: 'v1',
      title: '',
      stepsToReproduce: '',
      severity: 'minor',
      notes: '',
    },
    screenshots: {
      schemaVersion: 'v1',
      viewport: { path: 'screenshots/viewport.png', width: 1, height: 1, devicePixelRatio: 1 },
      elementCrops: [],
    },
    browser: null,
    console: null,
    network: null,
    dom: null,
    storage: null,
    cookies: null,
    navigation: null,
    reproduction: null,
    elementInspections: null,
  } as unknown as BugReportV1;
}

function fakeStorage(initial: Record<string, unknown> = {}): SettingsStorageArea {
  const data: Record<string, unknown> = { ...initial };
  return {
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

describe('buildHistoryEntry', () => {
  it('derives metadata-only fields from the report and finalize result', () => {
    const entry = buildHistoryEntry({
      report: makeReport(),
      removedIds: [],
      filename: 'bugcase-example-com-20260702-090807.zip',
      byteSize: 4096,
      downloadId: 11,
    });
    expect(entry).toMatchObject({
      id: 'cap-123',
      capturedAt: '2026-07-02T09:08:07.000Z',
      url: 'https://example.com/bug',
      title: 'Bug page',
      origin: 'https://example.com',
      filename: 'bugcase-example-com-20260702-090807.zip',
      byteSize: 4096,
      downloadId: 11,
      toolVersion: '0.9.0',
    });
  });

  it('records the artifacts actually included (present minus removed)', () => {
    const entry = buildHistoryEntry({
      report: makeReport(),
      removedIds: ['screenshot'],
      filename: 'r.zip',
      byteSize: 1,
      downloadId: null,
    });
    expect(entry.artifacts).toContain('metadata');
    expect(entry.artifacts).toContain('userInput');
    expect(entry.artifacts).not.toContain('screenshot');
    // absent sections are never listed
    expect(entry.artifacts).not.toContain('console');
  });

  it('includes a present, non-removed artifact', () => {
    const entry = buildHistoryEntry({
      report: makeReport(),
      removedIds: [],
      filename: 'r.zip',
      byteSize: 1,
      downloadId: null,
    });
    expect(entry.artifacts).toContain('screenshot');
  });
});

describe('saveDownloadedReport', () => {
  it('appends an entry to the history', async () => {
    const storage = fakeStorage();
    await saveDownloadedReport(
      { report: makeReport(), removedIds: [], filename: 'r.zip', byteSize: 5, downloadId: 3 },
      { storage },
    );
    const history = await getReportHistory({ storage });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: 'cap-123', filename: 'r.zip', downloadId: 3 });
  });

  it('is best-effort: resolves without throwing when persistence fails', async () => {
    await expect(
      saveDownloadedReport(
        { report: makeReport(), removedIds: [], filename: 'r.zip', byteSize: 5, downloadId: 3 },
        { storage: rejectingStorage },
      ),
    ).resolves.toBeUndefined();
  });

  it('is best-effort: resolves without throwing on a malformed report', async () => {
    await expect(
      saveDownloadedReport(
        {
          report: {} as unknown as BugReportV1,
          removedIds: [],
          filename: 'r.zip',
          byteSize: 5,
          downloadId: null,
        },
        { storage: fakeStorage() },
      ),
    ).resolves.toBeUndefined();
  });

  it('persists REPORT_HISTORY_STORAGE_KEY on success', async () => {
    const store: Record<string, unknown> = {};
    const storage: SettingsStorageArea = {
      get: (key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {}),
      set: (items: Record<string, unknown>) => {
        Object.assign(store, items);
        return Promise.resolve();
      },
    };
    await saveDownloadedReport(
      { report: makeReport(), removedIds: [], filename: 'r.zip', byteSize: 5, downloadId: 3 },
      { storage },
    );
    expect(store[REPORT_HISTORY_STORAGE_KEY]).toBeDefined();
  });
});
