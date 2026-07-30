/**
 * Element-inspection session state (S3-13).
 *
 * The pure core behind the picker controls: whether we're currently picking, and the list of
 * inspections collected this capture (each a raw payload + crop data URL). Held in the overlay for the
 * form phase and threaded into the capture — no browser, no React, unit-testable in isolation.
 */

import type { CaptureElementInspection } from '../background/element-inspection-finalize';

import { fitInspectionToBudget, formatBudgetNotice } from './crop-budget';

export type ElementPickerStatus = 'idle' | 'picking';

export interface ElementInspectionSessionState {
  readonly status: ElementPickerStatus;
  readonly inspections: readonly CaptureElementInspection[];
  /**
   * Set when the most recent pick's image was dropped for the crop budget (BUG-06); `null` otherwise.
   * Cleared by the next pick that fits, so it always describes the latest action.
   */
  readonly budgetNotice: string | null;
}

export const ELEMENT_INSPECTION_SESSION_INITIAL: ElementInspectionSessionState = {
  status: 'idle',
  inspections: [],
  budgetNotice: null,
};

export type ElementInspectionSessionAction =
  | { readonly type: 'startPicking' }
  | {
      readonly type: 'add';
      readonly inspection: CaptureElementInspection;
      /** Overrides the default crop budget; used in tests. */
      readonly budgetBytes?: number;
    }
  | { readonly type: 'restore'; readonly inspections: readonly CaptureElementInspection[] }
  | { readonly type: 'stopPicking' }
  | { readonly type: 'reset' };

export function elementInspectionSessionReducer(
  state: ElementInspectionSessionState,
  action: ElementInspectionSessionAction,
): ElementInspectionSessionState {
  switch (action.type) {
    case 'startPicking':
      return { ...state, status: 'picking' };
    case 'add': {
      // BUG-06: the crop's size is only knowable once it exists, so the budget is applied here —
      // the inspection keeps its structural data and loses only its image when it does not fit.
      const fit =
        action.budgetBytes === undefined
          ? fitInspectionToBudget(state.inspections, action.inspection)
          : fitInspectionToBudget(state.inspections, action.inspection, action.budgetBytes);
      return {
        ...state,
        inspections: [...state.inspections, fit.inspection],
        budgetNotice: fit.dropped ? formatBudgetNotice(fit) : null,
      };
    }
    case 'restore':
      return { ...state, inspections: action.inspections, budgetNotice: null };
    case 'stopPicking':
      return { ...state, status: 'idle' };
    case 'reset':
      return ELEMENT_INSPECTION_SESSION_INITIAL;
  }
}
