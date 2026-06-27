import { SeveritySchema, UserInputSchema } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { SEVERITY_OPTIONS, USER_REPORT_DEFAULTS, userReportReducer } from './user-report-state';

describe('USER_REPORT_DEFAULTS', () => {
  it('is an empty, minor-severity v1 report', () => {
    expect(USER_REPORT_DEFAULTS).toEqual({
      schemaVersion: 'v1',
      title: '',
      stepsToReproduce: '',
      severity: 'minor',
      notes: '',
    });
  });

  it('validates against UserInputSchema', () => {
    expect(UserInputSchema.parse(USER_REPORT_DEFAULTS)).toEqual(USER_REPORT_DEFAULTS);
  });
});

describe('SEVERITY_OPTIONS', () => {
  it('covers every Severity value exactly once', () => {
    const values = SEVERITY_OPTIONS.map((o) => o.value).sort();
    const expected = [...SeveritySchema.options].sort();
    expect(values).toEqual(expected);
  });

  it('gives every option a non-empty human label', () => {
    for (const option of SEVERITY_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe('userReportReducer', () => {
  it('sets severity without mutating the input', () => {
    const next = userReportReducer(USER_REPORT_DEFAULTS, {
      type: 'setSeverity',
      value: 'critical',
    });
    expect(next.severity).toBe('critical');
    expect(USER_REPORT_DEFAULTS.severity).toBe('minor');
  });

  it('sets the steps-to-reproduce free text', () => {
    const next = userReportReducer(USER_REPORT_DEFAULTS, {
      type: 'setSteps',
      value: '1. open the page',
    });
    expect(next.stepsToReproduce).toBe('1. open the page');
  });

  it('sets the notes free text', () => {
    const next = userReportReducer(USER_REPORT_DEFAULTS, { type: 'setNotes', value: 'flaky' });
    expect(next.notes).toBe('flaky');
  });

  it('keeps unrelated fields when updating one field', () => {
    const withSteps = userReportReducer(USER_REPORT_DEFAULTS, { type: 'setSteps', value: 'x' });
    const next = userReportReducer(withSteps, { type: 'setSeverity', value: 'major' });
    expect(next).toEqual({ ...USER_REPORT_DEFAULTS, stepsToReproduce: 'x', severity: 'major' });
  });

  it('resets to defaults', () => {
    const dirty = userReportReducer(USER_REPORT_DEFAULTS, { type: 'setNotes', value: 'n' });
    expect(userReportReducer(dirty, { type: 'reset' })).toEqual(USER_REPORT_DEFAULTS);
  });

  it('still produces schema-valid input after edits', () => {
    const edited = userReportReducer(
      userReportReducer(USER_REPORT_DEFAULTS, { type: 'setSeverity', value: 'major' }),
      { type: 'setNotes', value: 'note' },
    );
    expect(() => UserInputSchema.parse(edited)).not.toThrow();
  });
});
