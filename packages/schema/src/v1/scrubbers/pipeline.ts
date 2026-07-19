import type { ScrubberRuleApplied } from '../common';

import type { ScrubberRule } from './types';

/**
 * Result of running an ordered scrubber pipeline: the final scrubbed value, the
 * total number of matches across all rules, and a per-rule `applied` summary whose
 * entries are shaped exactly like the schema's {@link ScrubberRuleApplied}, ready to
 * drop into `CaptureMetadata.scrubbersApplied`.
 */
export interface ScrubberPipelineResult<T> {
  readonly value: T;
  readonly hits: number;
  readonly applied: readonly ScrubberRuleApplied[];
}

/**
 * Runs `rules` in order, threading the value through each. Pure and total: an empty
 * rule list (or any value, including `null`/`undefined`) yields a pass-through result
 * without throwing.
 */
export function runScrubberPipeline<T>(
  value: T,
  rules: readonly ScrubberRule<T>[],
): ScrubberPipelineResult<T> {
  let current = value;
  let totalHits = 0;
  const applied: ScrubberRuleApplied[] = [];

  for (const rule of rules) {
    const result = rule.apply(current);
    current = result.value;
    totalHits += result.hits;
    applied.push({ id: rule.id, description: rule.description, hits: result.hits });
  }

  return { value: current, hits: totalHits, applied };
}

/**
 * Sum per-rule hits across one or many scrub runs so `metadata.scrubbersApplied` carries a
 * single entry per rule. First-seen order and description win; rules that never fired are
 * dropped — the report only lists scrubbers that actually removed something.
 */
export function aggregateScrubberHits(
  applied: readonly ScrubberRuleApplied[],
): ScrubberRuleApplied[] {
  const byId = new Map<string, ScrubberRuleApplied>();
  for (const item of applied) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...prev, hits: prev.hits + item.hits } : { ...item });
  }
  return [...byId.values()].filter((rule) => rule.hits > 0);
}
