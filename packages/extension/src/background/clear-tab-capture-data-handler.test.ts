import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { OverlayDraft, OverlayDraftStorageArea } from '../storage/overlay-draft';
import { getOverlayDraft, saveOverlayDraft } from '../storage/overlay-draft';

import {
  CLEAR_TAB_CAPTURE_DATA,
  handleClearTabCaptureDataRequest,
  isClearTabCaptureDataRequest,
} from './clear-tab-capture-data-handler';

function fakeStorage(): OverlayDraftStorageArea & { data: Record<string, unknown> } {
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

const DRAFT: OverlayDraft = {
  captureOptions: {} as OverlayDraft['captureOptions'],
  userReport: {
    schemaVersion: 'v1',
    title: '',
    stepsToReproduce: '',
    severity: 'major',
    notes: '',
  },
  inspections: [],
  ui: { minimized: false, panelPos: null },
};

describe('isClearTabCaptureDataRequest', () => {
  it('accepts the clear message and rejects others', () => {
    expect(isClearTabCaptureDataRequest({ type: CLEAR_TAB_CAPTURE_DATA })).toBe(true);
    expect(isClearTabCaptureDataRequest({ type: 'bugcase/overlay-draft-clear' })).toBe(false);
    expect(isClearTabCaptureDataRequest(null)).toBe(false);
    expect(isClearTabCaptureDataRequest(undefined)).toBe(false);
  });
});

describe('handleClearTabCaptureDataRequest', () => {
  it('wipes the sending tab’s captured data and reports ok', async () => {
    const storage = fakeStorage();
    await saveOverlayDraft(7, DRAFT, { storage });

    const result = await handleClearTabCaptureDataRequest({ type: CLEAR_TAB_CAPTURE_DATA }, 7, {
      overlayDraft: { storage },
    });

    expect(result).toEqual({ ok: true });
    expect(await getOverlayDraft(7, { storage })).toBeNull();
  });

  it('fails closed without a tab id, touching no storage', async () => {
    const storage = fakeStorage();
    await saveOverlayDraft(7, DRAFT, { storage });

    const result = await handleClearTabCaptureDataRequest(
      { type: CLEAR_TAB_CAPTURE_DATA },
      undefined,
      { overlayDraft: { storage } },
    );

    expect(result).toEqual({ ok: false });
    expect(await getOverlayDraft(7, { storage })).toEqual(DRAFT);
  });
});
