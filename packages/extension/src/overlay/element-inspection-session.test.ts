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
    expect(ELEMENT_INSPECTION_SESSION_INITIAL).toEqual({ status: 'idle', inspections: [] });
  });

  it('startPicking → picking (keeps existing inspections)', () => {
    const state = elementInspectionSessionReducer(
      { status: 'idle', inspections: [inspection('<a/>')] },
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
      { status: 'picking', inspections: [inspection('<a/>')] },
      { type: 'stopPicking' },
    );
    expect(state).toEqual({ status: 'idle', inspections: [inspection('<a/>')] });
  });

  it('reset clears everything', () => {
    expect(
      elementInspectionSessionReducer(
        { status: 'picking', inspections: [inspection('<a/>')] },
        { type: 'reset' },
      ),
    ).toEqual(ELEMENT_INSPECTION_SESSION_INITIAL);
  });
});
