import { describe, expect, it } from 'vitest';

import type { CaptureElementInspection } from '../background/element-inspection-finalize';

import {
  ELEMENT_INSPECTION_SESSION_INITIAL,
  elementInspectionSessionReducer,
} from './element-inspection-session';

const inspection = (html: string): CaptureElementInspection => ({
  outerHtml: html,
  computedStyles: {},
  boundingClientRect: { x: 0, y: 0, width: 1, height: 1 },
  ancestors: [],
  cropDataUrl: null,
});

describe('elementInspectionSessionReducer', () => {
  it('starts idle and empty', () => {
    expect(ELEMENT_INSPECTION_SESSION_INITIAL).toEqual({
      status: 'idle',
      inspections: [],
      budgetNotice: null,
    });
  });

  it('startPicking → picking (keeps existing inspections)', () => {
    const state = elementInspectionSessionReducer(
      { status: 'idle', inspections: [inspection('<a/>')], budgetNotice: null },
      { type: 'startPicking' },
    );
    expect(state.status).toBe('picking');
    expect(state.inspections).toHaveLength(1);
  });

  it('add appends an inspection', () => {
    let state = elementInspectionSessionReducer(ELEMENT_INSPECTION_SESSION_INITIAL, {
      type: 'startPicking',
    });
    state = elementInspectionSessionReducer(state, { type: 'add', inspection: inspection('<a/>') });
    state = elementInspectionSessionReducer(state, { type: 'add', inspection: inspection('<b/>') });
    expect(state.inspections.map((i) => i.outerHtml)).toEqual(['<a/>', '<b/>']);
  });

  it('stopPicking → idle (keeps inspections)', () => {
    const state = elementInspectionSessionReducer(
      { status: 'picking', inspections: [inspection('<a/>')], budgetNotice: null },
      { type: 'stopPicking' },
    );
    expect(state).toEqual({
      status: 'idle',
      inspections: [inspection('<a/>')],
      budgetNotice: null,
    });
  });

  it('reset clears everything', () => {
    expect(
      elementInspectionSessionReducer(
        { status: 'picking', inspections: [inspection('<a/>')], budgetNotice: null },
        { type: 'reset' },
      ),
    ).toEqual(ELEMENT_INSPECTION_SESSION_INITIAL);
  });
});

describe('element inspection budget (BUG-06)', () => {
  const DATA_URL_PREFIX = 'data:image/png;base64,';

  /** An inspection whose crop data URL is exactly `bytes` characters long when stored. */
  function inspectionOfSize(bytes: number): CaptureElementInspection {
    const base64 = 'A'.repeat(Math.max(0, bytes - DATA_URL_PREFIX.length));
    return {
      outerHtml: '<button>Pay</button>',
      computedStyles: {},
      boundingClientRect: { x: 0, y: 0, width: 10, height: 10 },
      ancestors: [],
      cropDataUrl: `${DATA_URL_PREFIX}${base64}`,
    };
  }

  it('starts with no budget notice', () => {
    expect(ELEMENT_INSPECTION_SESSION_INITIAL.budgetNotice).toBeNull();
  });

  it('keeps the image and stays quiet when the crop fits', () => {
    const next = elementInspectionSessionReducer(ELEMENT_INSPECTION_SESSION_INITIAL, {
      type: 'add',
      inspection: inspectionOfSize(30),
    });
    expect(next.inspections[0]?.cropDataUrl).not.toBeNull();
    expect(next.budgetNotice).toBeNull();
  });

  it('drops the image and sets a notice when the crop does not fit', () => {
    const seeded = elementInspectionSessionReducer(ELEMENT_INSPECTION_SESSION_INITIAL, {
      type: 'add',
      inspection: inspectionOfSize(900),
      budgetBytes: 1000,
    });
    const next = elementInspectionSessionReducer(seeded, {
      type: 'add',
      inspection: inspectionOfSize(300),
      budgetBytes: 1000,
    });
    expect(next.inspections).toHaveLength(2);
    expect(next.inspections[1]?.cropDataUrl).toBeNull();
    expect(next.inspections[1]?.outerHtml).toBe('<button>Pay</button>');
    expect(next.budgetNotice).toContain('Added without its image');
  });

  it('clears a stale notice on the next pick that fits', () => {
    const withNotice = { ...ELEMENT_INSPECTION_SESSION_INITIAL, budgetNotice: 'old' };
    const next = elementInspectionSessionReducer(withNotice, {
      type: 'add',
      inspection: inspectionOfSize(30),
    });
    expect(next.budgetNotice).toBeNull();
  });

  it('clears a stale notice when the picker is re-entered, before any pick is made', () => {
    // Otherwise reopening the picker greets the user with the *previous* session's
    // "Added without its image…", describing an action they did not just take.
    const withNotice = {
      ...ELEMENT_INSPECTION_SESSION_INITIAL,
      inspections: [inspection('<a/>')],
      budgetNotice: 'Added without its image: …',
    };
    const next = elementInspectionSessionReducer(withNotice, { type: 'startPicking' });
    expect(next.budgetNotice).toBeNull();
    expect(next.status).toBe('picking');
    expect(next.inspections).toHaveLength(1);
  });

  it('restores inspections from a persisted draft', () => {
    const restored = elementInspectionSessionReducer(ELEMENT_INSPECTION_SESSION_INITIAL, {
      type: 'restore',
      inspections: [inspectionOfSize(30)],
    });
    expect(restored.inspections).toHaveLength(1);
    expect(restored.status).toBe('idle');
    expect(restored.budgetNotice).toBeNull();
  });
});
