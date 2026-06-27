/**
 * Per-rule DOM scrubber fixtures (S2-22).
 *
 * A declarative, table-driven suite that gives every DOM scrubber rule both a *positive* fixture
 * (input containing something that MUST be scrubbed) and a *negative* fixture (look-alike input
 * that MUST be left untouched). The negative direction is the privacy-critical complement to the
 * co-located behavioural tests in `../dom.test.ts`: it guards against over-scrubbing — silently
 * destroying legitimate captured markup — as much as against leaks.
 */

import { describe, expect, it } from 'vitest';

import {
  SCRUBBED_VALUE_PLACEHOLDER,
  createAllInputMaskRule,
  createPasswordInputMaskRule,
  createScriptStripRule,
} from '../dom';
import type { ScrubberRule } from '../types';

interface DomFixture {
  /** Human-readable case name, shown in the test title. */
  readonly name: string;
  readonly input: string;
  /** Expected number of rule hits — `0` marks a negative (must-not-scrub) fixture. */
  readonly hits: number;
  /** Substring that MUST be absent from the output (the secret that was removed). */
  readonly absent?: string;
  /** Substring that MUST be present in the output (placeholder, or preserved surrounding markup). */
  readonly present?: string;
  /** When set, the output must be byte-identical to the input. */
  readonly unchanged?: boolean;
}

function runFixture(rule: ScrubberRule<string>, fixture: DomFixture): void {
  const result = rule.apply(fixture.input);
  expect(result.hits).toBe(fixture.hits);
  if (fixture.unchanged === true) {
    expect(result.value).toBe(fixture.input);
  }
  if (fixture.absent !== undefined) {
    expect(result.value).not.toContain(fixture.absent);
  }
  if (fixture.present !== undefined) {
    expect(result.value).toContain(fixture.present);
  }
}

describe('dom-password-input-mask fixtures', () => {
  const rule = createPasswordInputMaskRule();

  const positives: readonly DomFixture[] = [
    {
      name: 'double-quoted password value',
      input: '<input type="password" value="hunter2">',
      hits: 1,
      absent: 'hunter2',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'single-quoted, uppercase tag/type',
      input: `<INPUT TYPE='PASSWORD' value='s3cret'>`,
      hits: 1,
      absent: 's3cret',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'unquoted type and value',
      input: '<input type=password value=letmein>',
      hits: 1,
      absent: 'letmein',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'value attribute before type attribute',
      input: '<input value="abc123" type="password">',
      hits: 1,
      absent: 'abc123',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'two password inputs counted independently',
      input: '<input type="password" value="aaa"><input type="password" value="bbb">',
      hits: 2,
      absent: 'aaa',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
  ];

  const negatives: readonly DomFixture[] = [
    {
      name: 'plain text input is visible data',
      input: '<input type="text" value="visible">',
      hits: 0,
      unchanged: true,
    },
    {
      name: 'password input with an empty value',
      input: '<input type="password" value="">',
      hits: 0,
      unchanged: true,
    },
    {
      name: 'password input with no value attribute',
      input: '<input type="password" name="pw">',
      hits: 0,
      unchanged: true,
    },
    {
      name: 'text input merely named "password"',
      input: '<input type="text" name="password" value="shown">',
      hits: 0,
      unchanged: true,
    },
    {
      name: 'prose mentioning password, no input',
      input: '<p>type your password here</p>',
      hits: 0,
      unchanged: true,
    },
  ];

  it.each(positives)('masks: $name', (fixture) => {
    runFixture(rule, fixture);
  });

  it.each(negatives)('leaves untouched: $name', (fixture) => {
    runFixture(rule, fixture);
  });
});

describe('dom-all-input-mask fixtures', () => {
  const rule = createAllInputMaskRule();

  const positives: readonly DomFixture[] = [
    {
      name: 'text input value',
      input: '<input type="text" value="visible">',
      hits: 1,
      absent: 'visible',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'email input value',
      input: '<input type="email" value="a@b.co">',
      hits: 1,
      absent: 'a@b.co',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'hidden input value (still user/app data)',
      input: '<input type="hidden" value="csrf-token-xyz">',
      hits: 1,
      absent: 'csrf-token-xyz',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'non-empty textarea content',
      input: '<textarea>typed notes</textarea>',
      hits: 1,
      absent: 'typed notes',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'one input plus one textarea counted separately',
      input: '<input type="search" value="query"><textarea>memo</textarea>',
      hits: 2,
      absent: 'query',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
  ];

  const negatives: readonly DomFixture[] = [
    {
      name: 'password input is left for the password rule',
      input: '<input type="password" value="kept">',
      hits: 0,
      unchanged: true,
    },
    { name: 'empty textarea', input: '<textarea></textarea>', hits: 0, unchanged: true },
    {
      name: 'input with no value attribute',
      input: '<input type="text" name="q">',
      hits: 0,
      unchanged: true,
    },
    {
      name: 'markup with no inputs at all',
      input: '<div><span>hello</span></div>',
      hits: 0,
      unchanged: true,
    },
  ];

  it.each(positives)('masks: $name', (fixture) => {
    runFixture(rule, fixture);
  });

  it.each(negatives)('leaves untouched: $name', (fixture) => {
    runFixture(rule, fixture);
  });
});

describe('dom-script-strip fixtures', () => {
  const rule = createScriptStripRule();

  const positives: readonly DomFixture[] = [
    {
      name: 'inline script block',
      input: '<p>hi</p><script>alert(1)</script>',
      hits: 1,
      absent: 'alert(1)',
      present: '<p>hi</p>',
    },
    {
      name: 'script with attributes',
      input: '<script src="a.js"></script><div>x</div>',
      hits: 1,
      absent: 'a.js',
      present: '<div>x</div>',
    },
    {
      name: 'two scripts, case-insensitive',
      input: '<SCRIPT>a()</SCRIPT><script type="module">b()</script>',
      hits: 2,
      absent: 'a()',
    },
    {
      name: 'multiline script body',
      input: '<script>\n  doThing();\n  more();\n</script>',
      hits: 1,
      absent: 'doThing',
    },
  ];

  const negatives: readonly DomFixture[] = [
    { name: 'no script elements', input: '<div>no scripts here</div>', hits: 0, unchanged: true },
    {
      name: 'escaped/entity-encoded script text',
      input: '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
      hits: 0,
      unchanged: true,
    },
    {
      name: '<noscript> is not a <script>',
      input: '<noscript>enable JS</noscript>',
      hits: 0,
      unchanged: true,
    },
    // Conservative-by-design: the rule targets browser-serialized outerHTML (always well-formed),
    // so an unclosed <script> with no closing tag is intentionally left as-is.
    {
      name: 'unclosed script (conservative, left as-is)',
      input: '<script>orphan()',
      hits: 0,
      unchanged: true,
    },
  ];

  it.each(positives)('strips: $name', (fixture) => {
    runFixture(rule, fixture);
  });

  it.each(negatives)('leaves untouched: $name', (fixture) => {
    runFixture(rule, fixture);
  });
});
