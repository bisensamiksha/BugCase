/**
 * Header, cookie, and token scrubber rules (S2-09).
 *
 * These remove credentials from captured network metadata before it enters the ZIP:
 * sensitive header values (cookie / authorization / CSRF, etc.) are masked outright, any
 * `Bearer …` token or JWT embedded in an ordinary header value is masked in place, and every
 * cookie value is masked by default. Each rule is a pure {@link ScrubberRule} so it composes
 * through {@link runScrubberPipeline} and contributes a `hits` count to `metadata.scrubbersApplied`.
 *
 * Pure string/array transforms keep the package dependency-light and node-testable, matching
 * the DOM scrubber (S2-08) it shares a redaction marker with.
 */

import type { CookieEntry } from '../cookies';
import type { NetworkHeader } from '../network';

import { SCRUBBED_VALUE_PLACEHOLDER } from './dom';
import { runScrubberPipeline, type ScrubberPipelineResult } from './pipeline';
import type { ScrubberResult, ScrubberRule } from './types';

/** Stable ids, surfaced in `scrubbersApplied` and the dashboard privacy pane. */
export const HEADER_SECRET_MASK_RULE_ID = 'header-secret-mask';
export const COOKIE_VALUE_MASK_RULE_ID = 'cookie-value-mask';

/** Header names (lowercase) whose entire value is masked on sight. */
export const SENSITIVE_HEADER_NAMES: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'authentication',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-xsrf-token',
  'csrf-token',
  'xsrf-token',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-amz-security-token',
];

/**
 * Mask `Bearer …` tokens (scheme kept) and JWTs anywhere in a string. Bearer is handled first
 * so a `Bearer <jwt>` is counted once, not twice. Returns the rewritten string and a hit count.
 */
export function maskSecretsInString(value: string): ScrubberResult<string> {
  if (typeof value !== 'string' || value.length === 0) {
    return { value, hits: 0 };
  }
  let hits = 0;
  let out = value.replace(/(\bBearer\s+)[\w.~+/=-]+/gi, (_match: string, scheme: string) => {
    hits += 1;
    return `${scheme}${SCRUBBED_VALUE_PLACEHOLDER}`;
  });
  out = out.replace(/\beyJ[\w-]*\.[\w-]+\.[\w-]+/g, () => {
    hits += 1;
    return SCRUBBED_VALUE_PLACEHOLDER;
  });
  return { value: out, hits };
}

/** Optional extra header names (case-insensitive) to treat as sensitive. */
export interface HeaderScrubberOptions {
  readonly additionalSensitiveHeaderNames?: readonly string[];
}

/**
 * Mask sensitive header values outright and bearer/JWT tokens inside ordinary header values.
 * Each masked header counts one hit; multiple tokens in one ordinary value count individually.
 */
export function createHeaderScrubberRule(
  options: HeaderScrubberOptions = {},
): ScrubberRule<readonly NetworkHeader[]> {
  const sensitive = new Set<string>([
    ...SENSITIVE_HEADER_NAMES,
    ...(options.additionalSensitiveHeaderNames ?? []).map((name) => name.toLowerCase()),
  ]);
  return {
    id: HEADER_SECRET_MASK_RULE_ID,
    description: 'Masks sensitive header values (cookie/authorization/CSRF) and bearer/JWT tokens',
    apply: (headers) => {
      let hits = 0;
      const value = headers.map((entry) => {
        if (sensitive.has(entry.name.toLowerCase())) {
          if (entry.value.length === 0) {
            return entry;
          }
          hits += 1;
          return { ...entry, value: SCRUBBED_VALUE_PLACEHOLDER };
        }
        const masked = maskSecretsInString(entry.value);
        if (masked.hits === 0) {
          return entry;
        }
        hits += masked.hits;
        return { ...entry, value: masked.value };
      });
      return { value, hits };
    },
  };
}

/** Mask every non-empty, not-yet-masked cookie value and flag it `masked`. */
export function createCookieScrubberRule(): ScrubberRule<readonly CookieEntry[]> {
  return {
    id: COOKIE_VALUE_MASK_RULE_ID,
    description: 'Masks all cookie values',
    apply: (cookies) => {
      let hits = 0;
      const value = cookies.map((entry) => {
        if (entry.masked || entry.value.length === 0) {
          return entry;
        }
        hits += 1;
        return { ...entry, value: SCRUBBED_VALUE_PLACEHOLDER, masked: true };
      });
      return { value, hits };
    },
  };
}

/** Scrub a header list, returning the cleaned headers plus `scrubbersApplied`-ready counts. */
export function scrubHeaders(
  headers: readonly NetworkHeader[],
  options?: HeaderScrubberOptions,
): ScrubberPipelineResult<readonly NetworkHeader[]> {
  return runScrubberPipeline(headers, [createHeaderScrubberRule(options)]);
}

/** Scrub a cookie list, returning the cleaned cookies plus `scrubbersApplied`-ready counts. */
export function scrubCookies(
  cookies: readonly CookieEntry[],
): ScrubberPipelineResult<readonly CookieEntry[]> {
  return runScrubberPipeline(cookies, [createCookieScrubberRule()]);
}
