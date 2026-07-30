import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { OverlayDraft, OverlayDraftStorageArea } from '../storage/overlay-draft';
import { getOverlayDraft, saveOverlayDraft } from '../storage/overlay-draft';
import { getPassiveErrorCount } from '../storage/passive-errors';
import type { PassiveErrorsStorageArea } from '../storage/passive-errors';
import { getRecordingSession, saveRecordingSession } from '../storage/recording-session';
import type { RecordingStorageArea } from '../storage/recording-session';

import { clearTabCaptureData } from './clear-tab-capture-data';
import type { BadgeAction } from './passive-error-badge';
import { recordPassiveError } from './passive-error-badge';

function fakeStorage<T extends { get(k: string): Promise<Record<string, unknown>> }>(): T & {
  data: Record<string, unknown>;
} {
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
  } as unknown as T & { data: Record<string, unknown> };
}

function fakeAction(): BadgeAction & { setBadgeText: ReturnType<typeof vi.fn> } {
  return {
    setBadgeText: vi.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
  };
}

const DRAFT: OverlayDraft = {
  captureOptions: {} as OverlayDraft['captureOptions'],
  userReport: {
    schemaVersion: 'v1',
    title: 'Checkout fails',
    stepsToReproduce: '',
    severity: 'major',
    notes: '',
  },
  inspections: [],
  ui: { minimized: false, panelPos: null },
};

describe('clearTabCaptureData', () => {
  it('clears the overlay draft for the tab', async () => {
    const overlayDraftStorage = fakeStorage<OverlayDraftStorageArea>();
    await saveOverlayDraft(7, DRAFT, { storage: overlayDraftStorage });

    await clearTabCaptureData(7, { overlayDraft: { storage: overlayDraftStorage } });

    expect(await getOverlayDraft(7, { storage: overlayDraftStorage })).toBeNull();
  });

  it('clears the recording session for the tab', async () => {
    const recordingStorage = fakeStorage<RecordingStorageArea>();
    await saveRecordingSession(
      7,
      {
        status: 'recording',
        startedAt: '2026-07-05T10:00:00.000Z',
        endedAt: null,
        url: 'https://a.test/',
        steps: [],
      },
      { storage: recordingStorage },
    );

    await clearTabCaptureData(7, { recordingSession: { storage: recordingStorage } });

    expect(await getRecordingSession(7, { storage: recordingStorage })).toBeNull();
  });

  it('clears the passive error count and badge for the tab', async () => {
    const passiveErrorStorage = fakeStorage<PassiveErrorsStorageArea>();
    const action = fakeAction();
    await recordPassiveError(7, { storage: passiveErrorStorage, action });

    await clearTabCaptureData(7, { passiveErrorBadge: { storage: passiveErrorStorage, action } });

    expect(await getPassiveErrorCount(7, { storage: passiveErrorStorage })).toBe(0);
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 7 });
  });

  it('does not touch another tab’s data', async () => {
    const overlayDraftStorage = fakeStorage<OverlayDraftStorageArea>();
    await saveOverlayDraft(1, DRAFT, { storage: overlayDraftStorage });
    await saveOverlayDraft(2, DRAFT, { storage: overlayDraftStorage });

    await clearTabCaptureData(1, { overlayDraft: { storage: overlayDraftStorage } });

    expect(await getOverlayDraft(1, { storage: overlayDraftStorage })).toBeNull();
    expect(await getOverlayDraft(2, { storage: overlayDraftStorage })).not.toBeNull();
  });

  it('clears the other stores even when one store fails to clear', async () => {
    const brokenOverlayDraftStorage: OverlayDraftStorageArea = {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.reject(new Error('storage unavailable')),
    };
    const recordingStorage = fakeStorage<RecordingStorageArea>();
    await saveRecordingSession(
      7,
      {
        status: 'recording',
        startedAt: '2026-07-05T10:00:00.000Z',
        endedAt: null,
        url: 'https://a.test/',
        steps: [],
      },
      { storage: recordingStorage },
    );

    await expect(
      clearTabCaptureData(7, {
        overlayDraft: { storage: brokenOverlayDraftStorage },
        recordingSession: { storage: recordingStorage },
      }),
    ).resolves.toBeUndefined();

    expect(await getRecordingSession(7, { storage: recordingStorage })).toBeNull();
  });
});
