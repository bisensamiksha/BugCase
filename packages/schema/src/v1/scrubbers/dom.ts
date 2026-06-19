/**
 * DOM scrubber rules (S2-08).
 *
 * These run over a captured DOM snapshot serialized as an HTML string — the shape the
 * `DomSnapshot` artifact stores — and remove sensitive user input before it enters the ZIP.
 * Each rule is a pure {@link ScrubberRule}<string> so it composes through
 * {@link runScrubberPipeline} and contributes a `hits` count to `metadata.scrubbersApplied`.
 *
 * Working on the serialized string (rather than a live DOM) keeps the package
 * dependency-light and testable in the node environment, mirroring the duck-typed approach
 * `safeStringify` already takes. Patterns are deliberately conservative: they target
 * browser-serialized `outerHTML`, not adversarial markup.
 */

import { runScrubberPipeline, type ScrubberPipelineResult } from './pipeline';
import type { ScrubberResult, ScrubberRule } from './types';

/** Replacement written into every scrubbed value/content slot. */
export const SCRUBBED_VALUE_PLACEHOLDER = '[scrubbed]';

/** Stable ids, surfaced in `scrubbersApplied` and the dashboard privacy pane. */
export const DOM_PASSWORD_INPUT_MASK_RULE_ID = 'dom-password-input-mask';
export const DOM_ALL_INPUT_MASK_RULE_ID = 'dom-all-input-mask';
export const DOM_SCRIPT_STRIP_RULE_ID = 'dom-script-strip';

/** True when an `<input …>` tag declares `type="password"` (quoted, single-quoted, or bare). */
function isPasswordInput(tag: string): boolean {
  return /\btype\s*=\s*(?:"\s*password\s*"|'\s*password\s*'|password\b)/i.test(tag);
}

/**
 * Replace a single tag's `value` attribute with the placeholder. Returns the rewritten tag
 * and whether anything was masked — an absent or already-empty value is left untouched so
 * the count reflects real secrets removed, not cosmetic rewrites.
 */
function maskValueAttribute(tag: string): { tag: string; masked: boolean } {
  const match = /(\bvalue\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i.exec(tag);
  const prefix = match?.[1];
  const raw = match?.[2];
  if (match === null || prefix === undefined || raw === undefined) {
    return { tag, masked: false };
  }
  const quoted =
    (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
  const inner = quoted ? raw.slice(1, -1) : raw;
  if (inner.length === 0) {
    return { tag, masked: false };
  }
  const rewritten =
    tag.slice(0, match.index) +
    prefix +
    `"${SCRUBBED_VALUE_PLACEHOLDER}"` +
    tag.slice(match.index + match[0].length);
  return { tag: rewritten, masked: true };
}

/** Mask the value attribute of every `<input>` tag matching `shouldMask`, counting each. */
function maskInputValues(
  html: string,
  shouldMask: (tag: string) => boolean,
): ScrubberResult<string> {
  let hits = 0;
  const value = html.replace(/<input\b[^>]*>/gi, (tag) => {
    if (!shouldMask(tag)) {
      return tag;
    }
    const { tag: rewritten, masked } = maskValueAttribute(tag);
    if (masked) {
      hits += 1;
    }
    return rewritten;
  });
  return { value, hits };
}

/** Mask non-empty `<textarea>` content, counting each masked element. */
function maskTextareaContent(html: string): ScrubberResult<string> {
  let hits = 0;
  const value = html.replace(
    /(<textarea\b[^>]*>)([\s\S]*?)(<\/textarea>)/gi,
    (full: string, open: string, inner: string, close: string) => {
      if (inner.length === 0) {
        return full;
      }
      hits += 1;
      return `${open}${SCRUBBED_VALUE_PLACEHOLDER}${close}`;
    },
  );
  return { value, hits };
}

/** Always-on rule: mask the value of every `<input type="password">`. */
export function createPasswordInputMaskRule(): ScrubberRule<string> {
  return {
    id: DOM_PASSWORD_INPUT_MASK_RULE_ID,
    description: 'Masks <input type="password"> values',
    apply: (value) =>
      typeof value === 'string' ? maskInputValues(value, isPasswordInput) : { value, hits: 0 },
  };
}

/**
 * Optional rule: mask the value of every non-password `<input>` and every `<textarea>`.
 * Password inputs are skipped so they are not double-counted alongside the password rule.
 */
export function createAllInputMaskRule(): ScrubberRule<string> {
  return {
    id: DOM_ALL_INPUT_MASK_RULE_ID,
    description: 'Masks all non-password input and textarea values',
    apply: (value) => {
      if (typeof value !== 'string') {
        return { value, hits: 0 };
      }
      const inputs = maskInputValues(value, (tag) => !isPasswordInput(tag));
      const textareas = maskTextareaContent(inputs.value);
      return { value: textareas.value, hits: inputs.hits + textareas.hits };
    },
  };
}

/** Optional rule: remove every `<script>…</script>` element, counting each. */
export function createScriptStripRule(): ScrubberRule<string> {
  return {
    id: DOM_SCRIPT_STRIP_RULE_ID,
    description: 'Strips <script> elements',
    apply: (value) => {
      if (typeof value !== 'string') {
        return { value, hits: 0 };
      }
      let hits = 0;
      const stripped = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, () => {
        hits += 1;
        return '';
      });
      return { value: stripped, hits };
    },
  };
}

/** Which optional DOM rules to include alongside the always-on password mask. */
export interface DomScrubberOptions {
  readonly maskAllInputs?: boolean;
  readonly stripScripts?: boolean;
}

export const DEFAULT_DOM_SCRUBBER_OPTIONS = {
  maskAllInputs: false,
  stripScripts: false,
} as const satisfies Required<DomScrubberOptions>;

/** Build the ordered DOM rule list: password mask always first, optional rules appended. */
export function createDomScrubberRules(
  options: DomScrubberOptions = {},
): readonly ScrubberRule<string>[] {
  const rules: ScrubberRule<string>[] = [createPasswordInputMaskRule()];
  if (options.maskAllInputs) {
    rules.push(createAllInputMaskRule());
  }
  if (options.stripScripts) {
    rules.push(createScriptStripRule());
  }
  return rules;
}

/** Scrub a serialized HTML snapshot, returning the cleaned HTML plus `scrubbersApplied`-ready counts. */
export function scrubDom(
  html: string,
  options?: DomScrubberOptions,
): ScrubberPipelineResult<string> {
  return runScrubberPipeline(html, createDomScrubberRules(options));
}
