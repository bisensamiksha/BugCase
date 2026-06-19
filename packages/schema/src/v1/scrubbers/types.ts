/**
 * Shared interfaces for the scrubber engine — the pluggable pipeline that removes
 * sensitive data from a captured artifact before it enters the ZIP.
 *
 * Sprint 1 shipped only the engine + a pass-through password placeholder. The real
 * rules land in sprint 2: DOM masking in S2-08 (./dom), header/cookie stripping in S2-09.
 */

/** Outcome of a single scrubber rule: the (possibly mutated) value plus how many times it matched. */
export interface ScrubberResult<T> {
  readonly value: T;
  readonly hits: number;
}

/** A pluggable, ordered scrubber rule. `apply` must be pure and must not throw on valid input. */
export interface ScrubberRule<T> {
  readonly id: string;
  readonly description: string;
  apply(value: T): ScrubberResult<T>;
}
