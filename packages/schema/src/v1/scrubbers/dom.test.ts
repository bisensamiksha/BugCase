import { describe, expect, it } from 'vitest';

import { ScrubberRuleAppliedSchema } from '../schemas/common.schema';

import {
  DEFAULT_DOM_SCRUBBER_OPTIONS,
  DOM_ALL_INPUT_MASK_RULE_ID,
  DOM_PASSWORD_INPUT_MASK_RULE_ID,
  DOM_SCRIPT_STRIP_RULE_ID,
  SCRUBBED_VALUE_PLACEHOLDER,
  createAllInputMaskRule,
  createDomScrubberRules,
  createPasswordInputMaskRule,
  createScriptStripRule,
  scrubDom,
} from './dom';

describe('createPasswordInputMaskRule', () => {
  it('masks a double-quoted value on a password input and counts one hit', () => {
    const rule = createPasswordInputMaskRule();
    const result = rule.apply('<input type="password" value="hunter2">');
    expect(result.value).toBe(`<input type="password" value="${SCRUBBED_VALUE_PLACEHOLDER}">`);
    expect(result.hits).toBe(1);
  });

  it('is case-insensitive for tag and type, and handles single quotes', () => {
    const rule = createPasswordInputMaskRule();
    const result = rule.apply(`<INPUT TYPE='PASSWORD' value='s3cret'>`);
    expect(result.value).toContain(`value="${SCRUBBED_VALUE_PLACEHOLDER}"`);
    expect(result.value).not.toContain('s3cret');
    expect(result.hits).toBe(1);
  });

  it('masks an unquoted value attribute, normalizing to double quotes', () => {
    const rule = createPasswordInputMaskRule();
    const result = rule.apply('<input type=password value=letmein>');
    expect(result.value).toBe(`<input type=password value="${SCRUBBED_VALUE_PLACEHOLDER}">`);
    expect(result.hits).toBe(1);
  });

  it('masks regardless of attribute order (value before type)', () => {
    const rule = createPasswordInputMaskRule();
    const result = rule.apply('<input value="abc" type="password">');
    expect(result.value).toBe(`<input value="${SCRUBBED_VALUE_PLACEHOLDER}" type="password">`);
    expect(result.hits).toBe(1);
  });

  it('leaves a password input with no value attribute unchanged (nothing to mask)', () => {
    const rule = createPasswordInputMaskRule();
    const html = '<input type="password" name="pw">';
    const result = rule.apply(html);
    expect(result.value).toBe(html);
    expect(result.hits).toBe(0);
  });

  it('does not count an already-empty value as a hit', () => {
    const rule = createPasswordInputMaskRule();
    const html = '<input type="password" value="">';
    const result = rule.apply(html);
    expect(result.value).toBe(html);
    expect(result.hits).toBe(0);
  });

  it('leaves non-password inputs untouched', () => {
    const rule = createPasswordInputMaskRule();
    const html = '<input type="text" value="visible">';
    const result = rule.apply(html);
    expect(result.value).toBe(html);
    expect(result.hits).toBe(0);
  });

  it('counts each masked password input across the document', () => {
    const rule = createPasswordInputMaskRule();
    const result = rule.apply(
      '<input type="password" value="a"><input type="text" value="x"><input type="password" value="b">',
    );
    expect(result.hits).toBe(2);
    expect(result.value).not.toContain('value="a"');
    expect(result.value).not.toContain('value="b"');
    expect(result.value).toContain('value="x"');
  });

  it('has a stable id and a non-empty description', () => {
    const rule = createPasswordInputMaskRule();
    expect(rule.id).toBe(DOM_PASSWORD_INPUT_MASK_RULE_ID);
    expect(rule.description.length).toBeGreaterThan(0);
  });
});

describe('createAllInputMaskRule', () => {
  it('masks non-password input values and counts hits', () => {
    const rule = createAllInputMaskRule();
    const result = rule.apply(
      '<input type="text" value="visible"><input type="email" value="a@b.co">',
    );
    expect(result.hits).toBe(2);
    expect(result.value).not.toContain('visible');
    expect(result.value).not.toContain('a@b.co');
  });

  it('skips password inputs so they are not double-counted with the password rule', () => {
    const rule = createAllInputMaskRule();
    const html = '<input type="password" value="kept-for-pw-rule">';
    const result = rule.apply(html);
    expect(result.value).toBe(html);
    expect(result.hits).toBe(0);
  });

  it('masks non-empty textarea content', () => {
    const rule = createAllInputMaskRule();
    const result = rule.apply('<textarea>typed notes</textarea>');
    expect(result.value).toBe(`<textarea>${SCRUBBED_VALUE_PLACEHOLDER}</textarea>`);
    expect(result.hits).toBe(1);
  });

  it('leaves an empty textarea unchanged', () => {
    const rule = createAllInputMaskRule();
    const html = '<textarea></textarea>';
    expect(rule.apply(html).value).toBe(html);
    expect(rule.apply(html).hits).toBe(0);
  });

  it('has a stable id', () => {
    expect(createAllInputMaskRule().id).toBe(DOM_ALL_INPUT_MASK_RULE_ID);
  });
});

describe('createScriptStripRule', () => {
  it('removes an inline script block and counts one hit', () => {
    const rule = createScriptStripRule();
    const result = rule.apply('<p>hi</p><script>alert(1)</script>');
    expect(result.value).toBe('<p>hi</p>');
    expect(result.hits).toBe(1);
  });

  it('removes scripts with attributes and counts each one, case-insensitively', () => {
    const rule = createScriptStripRule();
    const result = rule.apply('<SCRIPT src="a.js"></SCRIPT><script type="module">x()</script>');
    expect(result.value).toBe('');
    expect(result.hits).toBe(2);
  });

  it('leaves non-script content untouched', () => {
    const rule = createScriptStripRule();
    const html = '<div>no scripts here</div>';
    const result = rule.apply(html);
    expect(result.value).toBe(html);
    expect(result.hits).toBe(0);
  });

  it('has a stable id', () => {
    expect(createScriptStripRule().id).toBe(DOM_SCRIPT_STRIP_RULE_ID);
  });
});

describe('createDomScrubberRules', () => {
  it('masks passwords only by default (no all-input mask, no script strip)', () => {
    expect(DEFAULT_DOM_SCRUBBER_OPTIONS).toEqual({ maskAllInputs: false, stripScripts: false });
    expect(createDomScrubberRules().map((r) => r.id)).toEqual([DOM_PASSWORD_INPUT_MASK_RULE_ID]);
  });

  it('adds the all-input rule when maskAllInputs is enabled', () => {
    expect(createDomScrubberRules({ maskAllInputs: true }).map((r) => r.id)).toEqual([
      DOM_PASSWORD_INPUT_MASK_RULE_ID,
      DOM_ALL_INPUT_MASK_RULE_ID,
    ]);
  });

  it('adds the script-strip rule when stripScripts is enabled', () => {
    expect(createDomScrubberRules({ stripScripts: true }).map((r) => r.id)).toEqual([
      DOM_PASSWORD_INPUT_MASK_RULE_ID,
      DOM_SCRIPT_STRIP_RULE_ID,
    ]);
  });
});

describe('scrubDom', () => {
  it('masks passwords but does not touch other inputs or scripts by default', () => {
    const result = scrubDom(
      '<input type="password" value="secret"><input type="text" value="ok"><script>x()</script>',
    );
    expect(result.value).toContain(`value="${SCRUBBED_VALUE_PLACEHOLDER}"`);
    expect(result.value).toContain('value="ok"');
    expect(result.value).toContain('<script>x()</script>');
    expect(result.hits).toBe(1);
  });

  it('masks every user input exactly once with no double counting', () => {
    const result = scrubDom(
      '<input type="password" value="pw"><input type="text" value="name"><textarea>notes</textarea>',
      { maskAllInputs: true },
    );
    expect(result.value).not.toContain('"pw"');
    expect(result.value).not.toContain('name');
    expect(result.value).not.toContain('notes');
    expect(result.hits).toBe(3);
  });

  it('strips scripts when enabled', () => {
    const result = scrubDom('<div>x</div><script>evil()</script>', { stripScripts: true });
    expect(result.value).toBe('<div>x</div>');
    expect(result.hits).toBe(1);
  });

  it('produces per-rule applied entries valid against ScrubberRuleAppliedSchema', () => {
    const result = scrubDom('<input type="password" value="z">', {
      maskAllInputs: true,
      stripScripts: true,
    });
    expect(result.applied.map((a) => a.id)).toEqual([
      DOM_PASSWORD_INPUT_MASK_RULE_ID,
      DOM_ALL_INPUT_MASK_RULE_ID,
      DOM_SCRIPT_STRIP_RULE_ID,
    ]);
    for (const entry of result.applied) {
      expect(() => ScrubberRuleAppliedSchema.parse(entry)).not.toThrow();
    }
  });

  it('does not throw on empty input and reports zero hits', () => {
    expect(() => scrubDom('')).not.toThrow();
    expect(scrubDom('').hits).toBe(0);
    expect(scrubDom('   ').value).toBe('   ');
  });
});
