import type { Severity, UserInput } from '@bugcase/schema';
import { palette } from '@bugcase/shared-tokens';
import type { CSSProperties } from 'react';

import { SEVERITY_OPTIONS, userReportReducer } from './user-report-state';

export interface UserReportFormProps {
  readonly value: UserInput;
  readonly onChange: (next: UserInput) => void;
  readonly disabled?: boolean;
}

// Inline styles keep the form self-contained inside the Shadow DOM, matching CaptureOptions; a
// shared stylesheet is deferred to a later UI ticket.
const fieldsetStyle: CSSProperties = {
  border: `1px solid ${palette.slate200}`,
  borderRadius: '8px',
  padding: '8px 12px',
  margin: '0 0 8px',
};
const legendStyle: CSSProperties = { fontSize: '12px', fontWeight: 600, color: palette.slate600 };
const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  margin: '4px 0',
};
const labelStyle: CSSProperties = { fontSize: '12px', color: palette.slate600 };
const controlStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontSize: '13px',
  padding: '6px 8px',
  borderRadius: '6px',
  border: `1px solid ${palette.slate300}`,
  color: palette.slate900,
  background: palette.white,
};
const textareaStyle: CSSProperties = { ...controlStyle, minHeight: '56px', resize: 'vertical' };

export function UserReportForm({ value, onChange, disabled }: UserReportFormProps) {
  const isDisabled = disabled === true;

  return (
    <section data-testid="user-report-form" aria-label="Bug details">
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Details</legend>

        <div style={rowStyle}>
          <label htmlFor="user-report-severity" style={labelStyle}>
            Severity
          </label>
          <select
            id="user-report-severity"
            data-testid="user-report-severity"
            value={value.severity}
            disabled={isDisabled}
            style={controlStyle}
            onChange={(event) => {
              onChange(
                userReportReducer(value, {
                  type: 'setSeverity',
                  value: event.target.value as Severity,
                }),
              );
            }}
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={rowStyle}>
          <label htmlFor="user-report-steps" style={labelStyle}>
            Steps to reproduce
          </label>
          <textarea
            id="user-report-steps"
            data-testid="user-report-steps"
            value={value.stepsToReproduce}
            disabled={isDisabled}
            placeholder="What did you do before the bug appeared?"
            style={textareaStyle}
            onChange={(event) => {
              onChange(userReportReducer(value, { type: 'setSteps', value: event.target.value }));
            }}
          />
        </div>

        <div style={rowStyle}>
          <label htmlFor="user-report-notes" style={labelStyle}>
            Notes
          </label>
          <textarea
            id="user-report-notes"
            data-testid="user-report-notes"
            value={value.notes}
            disabled={isDisabled}
            placeholder="Anything else worth knowing?"
            style={textareaStyle}
            onChange={(event) => {
              onChange(userReportReducer(value, { type: 'setNotes', value: event.target.value }));
            }}
          />
        </div>
      </fieldset>
    </section>
  );
}
