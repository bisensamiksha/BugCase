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
 * `autocomplete` values the HTML spec reserves for credentials. A site's "Show password" control
 * flips `type` to `text` but leaves `autocomplete` alone, so this survives the toggle.
 */
const CREDENTIAL_AUTOCOMPLETE =
  /\bautocomplete\s*=\s*["']?\s*(?:current-password|new-password|one-time-code)\b/i;

/**
 * Credential-ish `name`/`id`/`class` tokens. Deliberately word-bounded where a bare substring would
 * over-match ("passenger" must not look like "password"). Over-masking only costs debugging
 * fidelity; under-masking leaks a secret, so ambiguous cases fail safe toward masking.
 */
// `identifyingAttributes` normalizes `-`/`_` and camelCase to spaces, so multi-word tokens are
// matched with a space separator here.
const CREDENTIAL_NAME =
  /\b(?:pass(?:word|phrase|code)?|pwd|secret|token|otp|cvv|cvc|ssn|security\s?code)\b/i;

/** The `name`, `id`, and `class` attribute values of a tag, for credential-name matching. */
function identifyingAttributes(tag: string): string {
  const parts: string[] = [];
  const re = /\b(?:name|id|class)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag)) !== null) {
    const raw = match[1] ?? '';
    const quoted =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
    // Split on separators so `password-field` / `user_secret` / `apiToken` all expose a bounded token.
    parts.push(
      (quoted ? raw.slice(1, -1) : raw).replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'),
    );
  }
  return parts.join(' ');
}

/**
 * True when an input carries a credential by **any** signal — the live `type`, a credential
 * `autocomplete` value, or a credential-looking `name`/`id`/`class` (BUG-04).
 *
 * Keying only off `type="password"` let a revealed password (a site's show-password control sets
 * `type="text"`) reach DOM snapshots and element inspections verbatim. Detection must not depend on
 * a value the page mutates at will.
 */
export function isCredentialInput(tag: string): boolean {
  return (
    isPasswordInput(tag) ||
    CREDENTIAL_AUTOCOMPLETE.test(tag) ||
    CREDENTIAL_NAME.test(identifyingAttributes(tag))
  );
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

/**
 * Always-on rule: mask the value of every credential input — `type="password"` plus anything a
 * credential `autocomplete`/`name`/`id`/`class` identifies, so a revealed password is still masked
 * (BUG-04). The rule id is unchanged so stored settings, `metadata.scrubbersApplied` history, and
 * the dashboard privacy pane keep resolving.
 */
export function createPasswordInputMaskRule(): ScrubberRule<string> {
  return {
    id: DOM_PASSWORD_INPUT_MASK_RULE_ID,
    description: 'Masks password and other credential input values',
    apply: (value) =>
      typeof value === 'string' ? maskInputValues(value, isCredentialInput) : { value, hits: 0 },
  };
}

/**
 * Optional rule: mask the value of every non-credential `<input>` and every `<textarea>`.
 * Credential inputs are skipped so they are not double-counted alongside the always-on rule.
 */
export function createAllInputMaskRule(): ScrubberRule<string> {
  return {
    id: DOM_ALL_INPUT_MASK_RULE_ID,
    description: 'Masks all non-credential input and textarea values',
    apply: (value) => {
      if (typeof value !== 'string') {
        return { value, hits: 0 };
      }
      const inputs = maskInputValues(value, (tag) => !isCredentialInput(tag));
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
