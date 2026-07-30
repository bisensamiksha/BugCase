import { describe, expect, it, vi } from 'vitest';

// The storage area is injected in every test, but importing lib/browser pulls in the polyfill; stub it.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { DEFAULT_USER_OPTIONS } from '../capture/metadata';

import {
  clearOverlayDraft,
  getOverlayDraft,
  saveOverlayDraft,
  type OverlayDraft,
  type OverlayDraftStorageArea,
} from './overlay-draft';

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
    title: 'Checkout fails',
    stepsToReproduce: '',
    severity: 'major',
    notes: '',
  },
  inspections: [
    {
      outerHtml: '<button>Pay</button>',
      computedStyles: { color: 'rgb(0, 0, 0)' },
      boundingClientRect: { x: 1, y: 2, width: 3, height: 4 },
      ancestors: [],
      cropDataUrl: 'data:image/png;base64,AAAA',
    },
  ],
  ui: { minimized: false, panelPos: { top: 10, left: 20 } },
};

describe('overlay-draft storage', () => {
  it('round-trips a saved draft for a tab', async () => {
    const storage = fakeStorage();
    await saveOverlayDraft(7, DRAFT, { storage });
    expect(await getOverlayDraft(7, { storage })).toEqual(DRAFT);
  });

  it('returns null when no draft exists for the tab', async () => {
    expect(await getOverlayDraft(7, { storage: fakeStorage() })).toBeNull();
  });

  it('keeps drafts for different tabs independent', async () => {
    const storage = fakeStorage();
    await saveOverlayDraft(1, DRAFT, { storage });
    await saveOverlayDraft(
      2,
      { ...DRAFT, userReport: { ...DRAFT.userReport, severity: 'critical' } },
      { storage },
    );
    expect((await getOverlayDraft(2, { storage }))?.userReport.severity).toBe('critical');
    expect((await getOverlayDraft(1, { storage }))?.userReport.severity).toBe('major');
  });

  it('clears a draft', async () => {
    const storage = fakeStorage();
    await saveOverlayDraft(7, DRAFT, { storage });
    await clearOverlayDraft(7, { storage });
    expect(await getOverlayDraft(7, { storage })).toBeNull();
  });

  it('returns null for a malformed stored blob instead of throwing', async () => {
    const storage = fakeStorage();
    storage.data['bugcase/overlay-draft:7'] = { captureOptions: 'nope' };
    expect(await getOverlayDraft(7, { storage })).toBeNull();
  });

  it('drops non-object inspections and coerces missing ui', async () => {
    const storage = fakeStorage();
    storage.data['bugcase/overlay-draft:7'] = {
      captureOptions: {},
      userReport: {},
      inspections: [{ outerHtml: '<i></i>' }, 'garbage', null],
    };
    const draft = await getOverlayDraft(7, { storage });
    expect(draft?.inspections).toHaveLength(1);
    expect(draft?.ui).toEqual({ minimized: false, panelPos: null });
  });

  it('returns null when the storage area throws', async () => {
    const storage: OverlayDraftStorageArea = {
      get: () => Promise.reject(new Error('nope')),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    expect(await getOverlayDraft(7, { storage })).toBeNull();
  });
});
