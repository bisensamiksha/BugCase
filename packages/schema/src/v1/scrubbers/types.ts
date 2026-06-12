/**
 * Shared interfaces for the scrubber engine — the pluggable pipeline that removes
 * sensitive data from a captured artifact before it enters the ZIP.
 *
 * Sprint 1 ships only the engine + a pass-through password placeholder; the real
 * rules (DOM masking, header/cookie stripping) land in sprint 2 (S2-12, S2-13).
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
