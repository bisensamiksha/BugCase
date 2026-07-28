import {
  DOM_ALL_INPUT_MASK_RULE_ID,
  DOM_PASSWORD_INPUT_MASK_RULE_ID,
  DOM_SCRIPT_STRIP_RULE_ID,
} from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

// settings.ts transitively imports lib/browser; stub the polyfill so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { toDomScrubberOptions } from './scrubber-options';
import { DEFAULT_SCRUBBER_TOGGLES, SCRUBBER_TOGGLE_DEFS } from './settings';

describe('toDomScrubberOptions (BUG-04 — the toggles were never wired to capture)', () => {
  it('maps the all-input toggle onto maskAllInputs', () => {
    expect(toDomScrubberOptions({ [DOM_ALL_INPUT_MASK_RULE_ID]: true }).maskAllInputs).toBe(true);
    expect(toDomScrubberOptions({ [DOM_ALL_INPUT_MASK_RULE_ID]: false }).maskAllInputs).toBe(false);
  });

  it('maps the script-strip toggle onto stripScripts', () => {
    expect(toDomScrubberOptions({ [DOM_SCRIPT_STRIP_RULE_ID]: true }).stripScripts).toBe(true);
    expect(toDomScrubberOptions({ [DOM_SCRIPT_STRIP_RULE_ID]: false }).stripScripts).toBe(false);
  });

  it('defaults both optional rules off when the toggles are absent', () => {
    expect(toDomScrubberOptions({})).toEqual({ maskAllInputs: false, stripScripts: false });
  });
});

describe('scrubber toggle defaults', () => {
  it('defaults to "sensitive only" — the credential mask runs, all-input masking does not', () => {
    // Wiring the toggles (above) makes their defaults load-bearing for the first time: leaving
    // all-input masking on would silently start scrubbing every field in every report.
    expect(DEFAULT_SCRUBBER_TOGGLES[DOM_ALL_INPUT_MASK_RULE_ID]).toBe(false);
    expect(DEFAULT_SCRUBBER_TOGGLES[DOM_SCRIPT_STRIP_RULE_ID]).toBe(false);
  });

  it('does not offer the credential mask as a toggle — it is always on', () => {
    // It is unconditional in createDomScrubberRules, so showing a switch for it was a lie, and a
    // switch that could turn it off would contradict the published "text is scrubbed" claim.
    expect(SCRUBBER_TOGGLE_DEFS.map((d) => d.id)).not.toContain(DOM_PASSWORD_INPUT_MASK_RULE_ID);
  });

  it('still offers the remaining rules', () => {
    const ids = SCRUBBER_TOGGLE_DEFS.map((d) => d.id);
    expect(ids).toContain(DOM_ALL_INPUT_MASK_RULE_ID);
    expect(ids).toContain(DOM_SCRIPT_STRIP_RULE_ID);
  });
});
