/**
 * Element-inspection session state (S3-13).
 *
 * The pure core behind the picker controls: whether we're currently picking, and the list of
 * inspections collected this capture (each a raw payload + crop data URL). Held in the overlay for the
 * form phase and threaded into the capture — no browser, no React, unit-testable in isolation.
 */

import type { CaptureElementInspection } from '../background/element-inspection-finalize';

export type ElementPickerStatus = 'idle' | 'picking';

export interface ElementInspectionSessionState {
  readonly status: ElementPickerStatus;
  readonly inspections: readonly CaptureElementInspection[];
}

export const ELEMENT_INSPECTION_SESSION_INITIAL: ElementInspectionSessionState = {
  status: 'idle',
  inspections: [],
};

export type ElementInspectionSessionAction =
  | { readonly type: 'startPicking' }
  | { readonly type: 'add'; readonly inspection: CaptureElementInspection }
  | { readonly type: 'stopPicking' }
  | { readonly type: 'reset' };

export function elementInspectionSessionReducer(
  state: ElementInspectionSessionState,
  action: ElementInspectionSessionAction,
): ElementInspectionSessionState {
  switch (action.type) {
    case 'startPicking':
      return { ...state, status: 'picking' };
    case 'add':
      return { ...state, inspections: [...state.inspections, action.inspection] };
    case 'stopPicking':
      return { ...state, status: 'idle' };
    case 'reset':
      return ELEMENT_INSPECTION_SESSION_INITIAL;
  }
}
