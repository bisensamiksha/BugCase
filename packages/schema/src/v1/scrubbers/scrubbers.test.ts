import { describe, expect, it } from 'vitest';

import { ScrubberRuleAppliedSchema } from '../schemas/common.schema';

import {
  PASSWORD_PLACEHOLDER_RULE_ID,
  createPasswordPlaceholderRule,
  defaultSprint1Scrubbers,
} from './password-placeholder';
import { aggregateScrubberHits, runScrubberPipeline } from './pipeline';
import type { ScrubberRule } from './types';

const appendRule = (id: string, suffix: string): ScrubberRule<string> => ({
  id,
  description: `append ${suffix}`,
  apply: (value) => ({ value: value + suffix, hits: 1 }),
});

describe('runScrubberPipeline', () => {
  it('is pass-through when there are no rules', () => {
    const result = runScrubberPipeline('secret', []);
    expect(result.value).toBe('secret');
    expect(result.hits).toBe(0);
    expect(result.applied).toEqual([]);
  });

  it('applies rules in order, threading the value through each', () => {
    const result = runScrubberPipeline('x', [appendRule('a', 'A'), appendRule('b', 'B')]);
    expect(result.value).toBe('xAB');
  });

  it('accumulates total hits and records a per-rule applied entry', () => {
    const result = runScrubberPipeline('x', [appendRule('a', 'A'), appendRule('b', 'B')]);
    expect(result.hits).toBe(2);
    expect(result.applied).toEqual([
      { id: 'a', description: 'append A', hits: 1 },
      { id: 'b', description: 'append B', hits: 1 },
    ]);
  });

  it('produces applied entries that satisfy the schema ScrubberRuleAppliedSchema', () => {
    const result = runScrubberPipeline('x', defaultSprint1Scrubbers<string>());
    expect(result.applied.length).toBeGreaterThan(0);
    for (const entry of result.applied) {
      expect(() => ScrubberRuleAppliedSchema.parse(entry)).not.toThrow();
    }
  });

  it('does not throw on a null value (empty state)', () => {
    expect(() => runScrubberPipeline(null, defaultSprint1Scrubbers<null>())).not.toThrow();
    expect(runScrubberPipeline(null, defaultSprint1Scrubbers<null>()).value).toBeNull();
  });
});

describe('aggregateScrubberHits', () => {
  const entry = (id: string, hits: number, description = `rule ${id}`) => ({
    id,
    description,
    hits,
  });

  it('returns an empty list for empty input', () => {
    expect(aggregateScrubberHits([])).toEqual([]);
  });

  it('sums hits by rule id, keeping first-seen order', () => {
    const result = aggregateScrubberHits([entry('a', 1), entry('b', 2), entry('a', 3)]);
    expect(result).toEqual([entry('a', 4), entry('b', 2)]);
  });

  it('keeps the first description seen for a rule id', () => {
    const result = aggregateScrubberHits([entry('a', 1, 'first'), entry('a', 1, 'second')]);
    expect(result).toEqual([entry('a', 2, 'first')]);
  });

  it('drops rules that never fired', () => {
    const result = aggregateScrubberHits([entry('a', 0), entry('b', 1), entry('a', 0)]);
    expect(result).toEqual([entry('b', 1)]);
  });
});

describe('ScrubberRuleAppliedSchema (metadata.scrubbersApplied slot lock)', () => {
  const valid = { id: 'dom-passwords', description: 'Mask password inputs', hits: 3 };

  it('round-trips a valid entry, and an empty list is a valid slot value', () => {
    expect(ScrubberRuleAppliedSchema.parse(valid)).toEqual(valid);
    expect(ScrubberRuleAppliedSchema.array().parse([])).toEqual([]);
    expect(ScrubberRuleAppliedSchema.array().parse([valid])).toEqual([valid]);
  });

  it('rejects an empty rule id', () => {
    expect(ScrubberRuleAppliedSchema.safeParse({ ...valid, id: '' }).success).toBe(false);
  });

  it('rejects negative hits', () => {
    expect(ScrubberRuleAppliedSchema.safeParse({ ...valid, hits: -1 }).success).toBe(false);
  });

  it('rejects non-integer hits', () => {
    expect(ScrubberRuleAppliedSchema.safeParse({ ...valid, hits: 1.5 }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(ScrubberRuleAppliedSchema.safeParse({ ...valid, value: 'leaked' }).success).toBe(false);
  });
});

describe('password placeholder rule', () => {
  it('is pass-through (hits 0) in sprint 1', () => {
    const rule = createPasswordPlaceholderRule<string>();
    const result = rule.apply('hunter2');
    expect(result.value).toBe('hunter2');
    expect(result.hits).toBe(0);
  });

  it('has a stable id and a non-empty description', () => {
    const rule = createPasswordPlaceholderRule<string>();
    expect(rule.id).toBe(PASSWORD_PLACEHOLDER_RULE_ID);
    expect(rule.description.length).toBeGreaterThan(0);
  });

  it('is the only rule in the default sprint-1 pipeline', () => {
    expect(defaultSprint1Scrubbers<string>().map((r) => r.id)).toEqual([
      PASSWORD_PLACEHOLDER_RULE_ID,
    ]);
  });
});
