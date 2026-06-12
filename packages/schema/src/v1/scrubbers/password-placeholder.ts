import type { ScrubberRule } from './types';

/** Stable id used in `scrubbersApplied` and the dashboard privacy pane. */
export const PASSWORD_PLACEHOLDER_RULE_ID = 'password-input-placeholder';

/**
 * Sprint-1 placeholder for the password-input scrubber. It is intentionally
 * pass-through (`hits: 0`) until the real DOM masking lands in S2-12; it exists so
 * the pipeline and `metadata.scrubbersApplied` can be wired end-to-end now.
 */
export function createPasswordPlaceholderRule<T>(): ScrubberRule<T> {
  return {
    id: PASSWORD_PLACEHOLDER_RULE_ID,
    description: 'Masks password input values (placeholder; activated in S2-12)',
    apply: (value) => ({ value, hits: 0 }),
  };
}

/**
 * The default scrubber set for sprint 1: pass-through except for the password
 * placeholder. Later sprints append the real DOM/header/cookie rules.
 */
export function defaultSprint1Scrubbers<T>(): readonly ScrubberRule<T>[] {
  return [createPasswordPlaceholderRule<T>()];
}
