/**
 * Per-rule header / cookie / token scrubber fixtures (S2-22).
 *
 * Table-driven coverage for the credential scrubbers (S2-09), each rule with positive (must-mask)
 * and negative (must-not-over-mask) fixtures. Two pieces of coverage go beyond the co-located
 * `../secrets.test.ts`:
 *   - every name in `SENSITIVE_HEADER_NAMES` is asserted masked (and case-insensitively), so the
 *     list can never silently drift out of sync with the rule that consumes it;
 *   - the token rule gets explicit look-alike negatives (UUIDs, version strings, base64 that is not
 *     a JWT) to guard against masking ordinary values.
 */

import { describe, expect, it } from 'vitest';

import type { CookieEntry } from '../../cookies';
import type { NetworkHeader } from '../../network';
import { SCRUBBED_VALUE_PLACEHOLDER } from '../dom';
import {
  SENSITIVE_HEADER_NAMES,
  createCookieScrubberRule,
  createHeaderScrubberRule,
  maskSecretsInString,
} from '../secrets';

const header = (name: string, value: string): NetworkHeader => ({ name, value });

const cookie = (overrides: Partial<CookieEntry> = {}): CookieEntry => ({
  name: 'sid',
  value: 'abc123',
  domain: 'example.com',
  path: '/',
  expiresAt: null,
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  session: false,
  masked: false,
  ...overrides,
});

interface StringFixture {
  readonly name: string;
  readonly input: string;
  readonly hits: number;
  readonly absent?: string;
  readonly present?: string;
  readonly unchanged?: boolean;
}

describe('maskSecretsInString fixtures', () => {
  const positives: readonly StringFixture[] = [
    {
      name: 'Bearer token keeps the scheme',
      input: 'Bearer sk_live_12345',
      hits: 1,
      absent: 'sk_live_12345',
      present: `Bearer ${SCRUBBED_VALUE_PLACEHOLDER}`,
    },
    {
      name: 'lower-case bearer scheme',
      input: 'bearer abc123def',
      hits: 1,
      absent: 'abc123def',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'bare JWT',
      input: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dQw4w9WgXcQ',
      hits: 1,
      absent: 'eyJhbGci',
      present: SCRUBBED_VALUE_PLACEHOLDER,
    },
    {
      name: 'Bearer-wrapped JWT counted once',
      input: 'Bearer eyJabc.def.ghi',
      hits: 1,
      absent: 'eyJabc',
      present: `Bearer ${SCRUBBED_VALUE_PLACEHOLDER}`,
    },
    {
      name: 'two distinct tokens counted each',
      input: 'eyJa.b.c then Bearer xyz_token end',
      hits: 2,
      absent: 'xyz_token',
    },
  ];

  const negatives: readonly StringFixture[] = [
    { name: 'ordinary content-type', input: 'text/html; charset=utf-8', hits: 0, unchanged: true },
    {
      name: 'three dotted parts without the eyJ prefix',
      input: 'app.v1.release',
      hits: 0,
      unchanged: true,
    },
    { name: 'a UUID', input: '550e8400-e29b-41d4-a716-446655440000', hits: 0, unchanged: true },
    {
      name: 'the word Bearer with no token after it',
      input: 'Authentication uses Bearer',
      hits: 0,
      unchanged: true,
    },
    {
      name: 'base64-ish but not a JWT (no eyJ)',
      input: 'YWJjZGVmZ2hpamtsbW5vcA==',
      hits: 0,
      unchanged: true,
    },
    { name: 'empty string', input: '', hits: 0, unchanged: true },
  ];

  function runFixture(fixture: StringFixture): void {
    const result = maskSecretsInString(fixture.input);
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

  it.each(positives)('masks: $name', (fixture) => {
    runFixture(fixture);
  });

  it.each(negatives)('leaves untouched: $name', (fixture) => {
    runFixture(fixture);
  });
});

describe('header-secret-mask fixtures', () => {
  // Positive: every sensitive header name is masked, and case does not matter. Driving this off the
  // exported list keeps the rule and its name list provably in lockstep.
  it.each([...SENSITIVE_HEADER_NAMES])('masks the %s header value', (name) => {
    const result = createHeaderScrubberRule().apply([header(name, 'super-secret-value')]);
    expect(result.value[0]?.value).toBe(SCRUBBED_VALUE_PLACEHOLDER);
    expect(result.value[0]?.name).toBe(name);
    expect(result.hits).toBe(1);
  });

  it.each([...SENSITIVE_HEADER_NAMES])('masks the %s header case-insensitively', (name) => {
    const result = createHeaderScrubberRule().apply([
      header(name.toUpperCase(), 'super-secret-value'),
    ]);
    expect(result.value[0]?.value).toBe(SCRUBBED_VALUE_PLACEHOLDER);
    expect(result.hits).toBe(1);
  });

  it('masks a Bearer/JWT token embedded in an ordinary header value', () => {
    const result = createHeaderScrubberRule().apply([header('X-Custom', 'Bearer eyJa.b.c')]);
    expect(result.value[0]?.value).toBe(`Bearer ${SCRUBBED_VALUE_PLACEHOLDER}`);
    expect(result.hits).toBe(1);
  });

  // Negative: ordinary headers, an empty sensitive value, and a sensitive-sounding but unlisted name.
  const ordinaryHeaders = ['content-type', 'accept', 'user-agent', 'cache-control', 'x-request-id'];

  it.each(ordinaryHeaders)('leaves the ordinary %s header untouched', (name) => {
    const headers = [header(name, 'just-a-plain-value')];
    const result = createHeaderScrubberRule().apply(headers);
    expect(result.value).toEqual(headers);
    expect(result.hits).toBe(0);
  });

  it('does not count an empty sensitive header value', () => {
    const headers = [header('Authorization', '')];
    const result = createHeaderScrubberRule().apply(headers);
    expect(result.value).toEqual(headers);
    expect(result.hits).toBe(0);
  });

  it('does not throw on an empty header list', () => {
    expect(createHeaderScrubberRule().apply([])).toEqual({ value: [], hits: 0 });
  });
});

describe('cookie-value-mask fixtures', () => {
  const rule = createCookieScrubberRule();

  it('masks a populated cookie value and flags it masked', () => {
    const result = rule.apply([cookie({ value: 'session-token-abc' })]);
    expect(result.value[0]?.value).toBe(SCRUBBED_VALUE_PLACEHOLDER);
    expect(result.value[0]?.masked).toBe(true);
    expect(result.hits).toBe(1);
  });

  it('masks every populated cookie, counting each', () => {
    const result = rule.apply([cookie({ value: 'a1' }), cookie({ name: 'csrf', value: 'b2' })]);
    expect(result.hits).toBe(2);
    expect(result.value.every((c) => c.value === SCRUBBED_VALUE_PLACEHOLDER && c.masked)).toBe(
      true,
    );
  });

  it('preserves non-value cookie fields while masking', () => {
    const result = rule.apply([cookie({ name: 'sid', domain: 'x.io', httpOnly: true })]);
    expect(result.value[0]).toMatchObject({ name: 'sid', domain: 'x.io', httpOnly: true });
  });

  // Negatives: an already-masked cookie and an empty-value cookie are both left alone.
  it('skips an already-masked cookie', () => {
    const masked = cookie({ value: SCRUBBED_VALUE_PLACEHOLDER, masked: true });
    const result = rule.apply([masked]);
    expect(result.value).toEqual([masked]);
    expect(result.hits).toBe(0);
  });

  it('skips an empty-value cookie', () => {
    const empty = cookie({ value: '' });
    const result = rule.apply([empty]);
    expect(result.value).toEqual([empty]);
    expect(result.hits).toBe(0);
  });

  it('does not throw on an empty cookie list', () => {
    expect(rule.apply([])).toEqual({ value: [], hits: 0 });
  });
});
