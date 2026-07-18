import type { ReproductionRecording, ReproductionStep } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { formatOffset, reproMarkdown, stepOffsetMs } from './repro-markdown';

const step = (over: Partial<ReproductionStep>): ReproductionStep => ({
  id: 's1',
  timestamp: '2026-07-18T10:00:00.000Z',
  type: 'click',
  selector: '#login',
  description: 'Clicked "Login" (button)',
  metadata: {},
  ...over,
});

const recording = (
  steps: readonly ReproductionStep[],
  over: Partial<ReproductionRecording> = {},
): ReproductionRecording => ({
  schemaVersion: 'v1',
  startedAt: '2026-07-18T10:00:00.000Z',
  endedAt: '2026-07-18T10:00:42.000Z',
  steps,
  ...over,
});

describe('stepOffsetMs', () => {
  it('returns the millisecond delta from startedAt', () => {
    expect(stepOffsetMs('2026-07-18T10:00:00.000Z', '2026-07-18T10:00:03.000Z')).toBe(3000);
  });

  it('returns null for unparseable timestamps or negative deltas', () => {
    expect(stepOffsetMs('nonsense', '2026-07-18T10:00:03.000Z')).toBeNull();
    expect(stepOffsetMs('2026-07-18T10:00:00.000Z', 'nonsense')).toBeNull();
    expect(stepOffsetMs('2026-07-18T10:00:03.000Z', '2026-07-18T10:00:00.000Z')).toBeNull();
  });
});

describe('formatOffset', () => {
  it('formats m:ss and adds hours only from one hour', () => {
    expect(formatOffset(0)).toBe('0:00');
    expect(formatOffset(3000)).toBe('0:03');
    expect(formatOffset(67_000)).toBe('1:07');
    expect(formatOffset(3_723_000)).toBe('1:02:03');
  });
});

describe('reproMarkdown', () => {
  it('produces the header sentence and numbered offset lines with selector code spans', () => {
    const md = reproMarkdown(
      recording([
        step({}),
        step({
          id: 's2',
          timestamp: '2026-07-18T10:00:03.000Z',
          type: 'input',
          selector: 'input[name="email"]',
          description: 'Typed into input',
        }),
      ]),
    );
    expect(md).toBe(
      [
        '## Reproduction steps',
        '',
        'Recorded 2026-07-18, 2 steps over 0:42.',
        '',
        '1. (+0:00) Clicked "Login" (button) — `#login`',
        '2. (+0:03) Typed into input — `input[name="email"]`',
        '',
      ].join('\n'),
    );
  });

  it('uses the singular "step" for one step', () => {
    expect(reproMarkdown(recording([step({})]))).toContain('1 step over 0:42.');
  });

  it('omits the offset for an unparseable step timestamp', () => {
    const md = reproMarkdown(recording([step({ timestamp: 'nonsense' })]));
    expect(md).toContain('1. Clicked "Login" (button) — `#login`');
    expect(md).not.toContain('(+');
  });

  it('omits duration and date when the recording timestamps are unparseable', () => {
    const md = reproMarkdown(recording([step({})], { startedAt: 'bad', endedAt: 'bad' }));
    expect(md).toContain('Recorded 1 step.');
    expect(md).not.toContain('over');
  });

  it('omits the selector code span when the selector is empty', () => {
    const md = reproMarkdown(recording([step({ selector: '' })]));
    expect(md).toContain('1. (+0:00) Clicked "Login" (button)');
    expect(md).not.toContain('—');
  });

  it('grows the code fence when the selector contains backticks', () => {
    const md = reproMarkdown(recording([step({ selector: 'a[title="`x`"]' })]));
    expect(md).toContain('`` a[title="`x`"] ``');
  });
});
