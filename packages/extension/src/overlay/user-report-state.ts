/**
 * User-report state (S2-21).
 *
 * The pure core behind the overlay's severity + steps + notes form: the canonical empty defaults
 * (the single source of truth for an unfilled `UserInput`, re-used by the capture request), the
 * severity dropdown options, and a pure reducer. No React, no browser — unit-testable in isolation.
 */

import type { Severity, UserInput } from '@bugcase/schema';

/** A blank, minor-severity report — the starting point before the user types anything. */
export const USER_REPORT_DEFAULTS: UserInput = {
  schemaVersion: 'v1',
  title: '',
  stepsToReproduce: '',
  severity: 'minor',
  notes: '',
};

export interface SeverityOption {
  readonly value: Severity;
  readonly label: string;
}

/** Severity choices rendered by the dropdown, ordered least → most severe. */
export const SEVERITY_OPTIONS: readonly SeverityOption[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'major', label: 'Major' },
  { value: 'critical', label: 'Critical' },
];

export type UserReportAction =
  | { readonly type: 'setSeverity'; readonly value: Severity }
  | { readonly type: 'setSteps'; readonly value: string }
  | { readonly type: 'setNotes'; readonly value: string }
  | { readonly type: 'reset' };

/** Pure reducer over the user-report fields; never mutates `state`. */
export function userReportReducer(state: UserInput, action: UserReportAction): UserInput {
  switch (action.type) {
    case 'setSeverity':
      return { ...state, severity: action.value };
    case 'setSteps':
      return { ...state, stepsToReproduce: action.value };
    case 'setNotes':
      return { ...state, notes: action.value };
    case 'reset':
      return USER_REPORT_DEFAULTS;
  }
}
