import type { ScrubberRule } from './types';

/** Stable id used in `scrubbersApplied` and the dashboard privacy pane. */
export const PASSWORD_PLACEHOLDER_RULE_ID = 'password-input-placeholder';

/**
 * Generic, type-agnostic pass-through rule (`hits: 0`) that wires the pipeline and
 * `metadata.scrubbersApplied` end-to-end. The real, HTML-aware password masking now lives
 * in `./dom` (S2-08); this remains as the engine's neutral default for non-DOM artifacts.
 */
export function createPasswordPlaceholderRule<T>(): ScrubberRule<T> {
  return {
    id: PASSWORD_PLACEHOLDER_RULE_ID,
    description: 'Masks password input values (generic placeholder; real masking in ./dom, S2-08)',
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
