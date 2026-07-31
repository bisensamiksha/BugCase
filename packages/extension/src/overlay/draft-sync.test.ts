import { describe, expect, it, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  OVERLAY_DRAFT_CLEAR,
  OVERLAY_DRAFT_GET,
  OVERLAY_DRAFT_SAVE,
  type OverlayDraftRequest,
  type OverlayDraftResponse,
} from '../background/overlay-draft-handler';
import { DEFAULT_USER_OPTIONS } from '../capture/metadata';
import type { OverlayDraft } from '../storage/overlay-draft';

import { clearDraft, getDraft, saveDraft } from './draft-sync';

const DRAFT: OverlayDraft = {
  captureOptions: DEFAULT_USER_OPTIONS,
  userReport: {
    schemaVersion: 'v1',
    title: '',
    stepsToReproduce: '',
    severity: 'minor',
    notes: '',
  },
  inspections: [],
  ui: { minimized: false, panelPos: null },
};

describe('draft-sync', () => {
  it('sends a save message carrying the draft', async () => {
    const sent: OverlayDraftRequest[] = [];
    const send = (message: OverlayDraftRequest): Promise<OverlayDraftResponse> => {
      sent.push(message);
      return Promise.resolve({ ok: true });
    };
    await saveDraft(DRAFT, send);
    expect(sent).toEqual([{ type: OVERLAY_DRAFT_SAVE, draft: DRAFT }]);
  });

  it('returns the draft from a get', async () => {
    const sent: OverlayDraftRequest[] = [];
    const send = (message: OverlayDraftRequest): Promise<OverlayDraftResponse> => {
      sent.push(message);
      return Promise.resolve({ ok: true, draft: DRAFT });
    };
    expect(await getDraft(send)).toEqual(DRAFT);
    expect(sent).toEqual([{ type: OVERLAY_DRAFT_GET }]);
  });

  it('returns null when the worker reports failure', async () => {
    const send = (): Promise<OverlayDraftResponse> => Promise.resolve({ ok: false });
    expect(await getDraft(send)).toBeNull();
  });

  it('returns null when the relay rejects', async () => {
    const send = (): Promise<OverlayDraftResponse> => Promise.reject(new Error('no receiver'));
    expect(await getDraft(send)).toBeNull();
  });

  it('sends a clear message and swallows a rejection', async () => {
    const sent: OverlayDraftRequest[] = [];
    const send = (message: OverlayDraftRequest): Promise<OverlayDraftResponse> => {
      sent.push(message);
      return Promise.reject(new Error('no receiver'));
    };
    await expect(clearDraft(send)).resolves.toBeUndefined();
    expect(sent).toEqual([{ type: OVERLAY_DRAFT_CLEAR }]);
  });
});
