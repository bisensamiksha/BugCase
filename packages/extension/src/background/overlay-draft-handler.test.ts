import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import { DEFAULT_USER_OPTIONS } from '../capture/metadata';
import type { OverlayDraft, OverlayDraftStorageArea } from '../storage/overlay-draft';

import {
  OVERLAY_DRAFT_CLEAR,
  OVERLAY_DRAFT_GET,
  OVERLAY_DRAFT_SAVE,
  handleOverlayDraftRequest,
  isOverlayDraftRequest,
} from './overlay-draft-handler';

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
  captureOptions: DEFAULT_USER_OPTIONS,
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

describe('isOverlayDraftRequest', () => {
  it('accepts the draft messages and rejects others', () => {
    expect(isOverlayDraftRequest({ type: OVERLAY_DRAFT_GET })).toBe(true);
    expect(isOverlayDraftRequest({ type: OVERLAY_DRAFT_SAVE, draft: DRAFT })).toBe(true);
    expect(isOverlayDraftRequest({ type: OVERLAY_DRAFT_CLEAR })).toBe(true);
    expect(isOverlayDraftRequest({ type: 'bugcase/capture-report' })).toBe(false);
    expect(isOverlayDraftRequest(null)).toBe(false);
  });
});

describe('handleOverlayDraftRequest', () => {
  it('saves then returns the draft for the sending tab', async () => {
    const storage = fakeStorage();
    await handleOverlayDraftRequest({ type: OVERLAY_DRAFT_SAVE, draft: DRAFT }, 7, { storage });
    const result = await handleOverlayDraftRequest({ type: OVERLAY_DRAFT_GET }, 7, { storage });
    expect(result).toEqual({ ok: true, draft: DRAFT });
  });

  it('clears the draft', async () => {
    const storage = fakeStorage();
    await handleOverlayDraftRequest({ type: OVERLAY_DRAFT_SAVE, draft: DRAFT }, 7, { storage });
    await handleOverlayDraftRequest({ type: OVERLAY_DRAFT_CLEAR }, 7, { storage });
    const result = await handleOverlayDraftRequest({ type: OVERLAY_DRAFT_GET }, 7, { storage });
    expect(result).toEqual({ ok: true, draft: null });
  });

  it('fails closed without a tab id', async () => {
    const storage = fakeStorage();
    expect(
      await handleOverlayDraftRequest({ type: OVERLAY_DRAFT_GET }, undefined, { storage }),
    ).toEqual({ ok: false });
  });
});
