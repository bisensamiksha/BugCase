/**
 * Bridge the user's stored scrubber toggles to the schema's DOM scrubber options (BUG-04).
 *
 * These toggles were previously written by the options page and read by nothing: the capture path
 * called `collectDomSnapshot` without `scrubberOptions`, so `scrubDom` always ran with its defaults
 * and every switch in Settings was decorative. This is the missing edge.
 *
 * The credential mask is deliberately absent — it is unconditional in `createDomScrubberRules`, so
 * it needs no option and must not become switchable.
 */

import {
  DOM_ALL_INPUT_MASK_RULE_ID,
  DOM_SCRIPT_STRIP_RULE_ID,
  type DomScrubberOptions,
} from '@bugcase/schema';

import type { ScrubberToggles } from './settings';

/** Translate stored toggles into the options `scrubDom` understands; absent toggles stay off. */
export function toDomScrubberOptions(scrubbers: ScrubberToggles): Required<DomScrubberOptions> {
  return {
    maskAllInputs: scrubbers[DOM_ALL_INPUT_MASK_RULE_ID] === true,
    stripScripts: scrubbers[DOM_SCRIPT_STRIP_RULE_ID] === true,
  };
}
