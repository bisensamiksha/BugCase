import { describe, expect, it } from 'vitest';

import type { CookieEntry } from '../cookies';
import type { NetworkHeader } from '../network';
import { ScrubberRuleAppliedSchema } from '../schemas/common.schema';

import { SCRUBBED_VALUE_PLACEHOLDER } from './dom';
import {
  COOKIE_VALUE_MASK_RULE_ID,
  HEADER_SECRET_MASK_RULE_ID,
  SENSITIVE_HEADER_NAMES,
  createCookieScrubberRule,
  createHeaderScrubberRule,
  maskSecretsInString,
  scrubCookies,
  scrubHeaders,
} from './secrets';

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

describe('maskSecretsInString', () => {
  it('masks a Bearer token while keeping the scheme', () => {
    const result = maskSecretsInString('Bearer sk_live_12345');
    expect(result.value).toBe(`Bearer ${SCRUBBED_VALUE_PLACEHOLDER}`);
    expect(result.hits).toBe(1);
  });

  it('masks a bare JWT', () => {
    const result = maskSecretsInString('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dQw4w9WgXcQ');
    expect(result.value).toBe(SCRUBBED_VALUE_PLACEHOLDER);
    expect(result.hits).toBe(1);
  });

  it('counts a Bearer-wrapped JWT once (no double counting)', () => {
    const result = maskSecretsInString('Bearer eyJhbGci.eyJzdWIi.sigPart');
    expect(result.value).toBe(`Bearer ${SCRUBBED_VALUE_PLACEHOLDER}`);
    expect(result.hits).toBe(1);
  });

  it('leaves non-secret text untouched', () => {
    const result = maskSecretsInString('text/html; charset=utf-8');
    expect(result.value).toBe('text/html; charset=utf-8');
    expect(result.hits).toBe(0);
  });

  it('masks multiple distinct tokens, counting each', () => {
    const result = maskSecretsInString('a eyJa.b.c and Bearer xyz_token end');
    expect(result.hits).toBe(2);
    expect(result.value).not.toContain('eyJa');
    expect(result.value).not.toContain('xyz_token');
  });

  it('does not throw on empty input', () => {
    expect(maskSecretsInString('')).toEqual({ value: '', hits: 0 });
  });
});

describe('createHeaderScrubberRule', () => {
  it('masks the Authorization header value', () => {
    const result = createHeaderScrubberRule().apply([header('Authorization', 'Bearer abc')]);
    expect(result.value).toEqual([header('Authorization', SCRUBBED_VALUE_PLACEHOLDER)]);
    expect(result.hits).toBe(1);
  });

  it('masks Cookie and Set-Cookie headers case-insensitively', () => {
    const result = createHeaderScrubberRule().apply([
      header('cookie', 'sid=abc; theme=dark'),
      header('Set-Cookie', 'sid=abc; HttpOnly'),
    ]);
    expect(result.value.every((h) => h.value === SCRUBBED_VALUE_PLACEHOLDER)).toBe(true);
    expect(result.hits).toBe(2);
  });

  it('masks an x-csrf-token header', () => {
    const result = createHeaderScrubberRule().apply([header('X-CSRF-Token', 'tok123')]);
    expect(result.value[0]?.value).toBe(SCRUBBED_VALUE_PLACEHOLDER);
    expect(result.hits).toBe(1);
  });

  it('leaves ordinary headers untouched', () => {
    const headers = [header('Content-Type', 'application/json')];
    const result = createHeaderScrubberRule().apply(headers);
    expect(result.value).toEqual(headers);
    expect(result.hits).toBe(0);
  });

  it('masks bearer/JWT tokens embedded in a non-sensitive header value', () => {
    const result = createHeaderScrubberRule().apply([header('X-Custom', 'Bearer eyJa.b.c')]);
    expect(result.value[0]?.value).toBe(`Bearer ${SCRUBBED_VALUE_PLACEHOLDER}`);
    expect(result.hits).toBe(1);
  });

  it('does not count an empty sensitive header value', () => {
    const headers = [header('Authorization', '')];
    const result = createHeaderScrubberRule().apply(headers);
    expect(result.value).toEqual(headers);
    expect(result.hits).toBe(0);
  });

  it('preserves the header name and only changes the value', () => {
    const result = createHeaderScrubberRule().apply([header('Authorization', 'secret')]);
    expect(result.value[0]?.name).toBe('Authorization');
  });

  it('supports additional sensitive header names', () => {
    const rule = createHeaderScrubberRule({ additionalSensitiveHeaderNames: ['X-Company-Secret'] });
    const result = rule.apply([header('x-company-secret', 'value')]);
    expect(result.value[0]?.value).toBe(SCRUBBED_VALUE_PLACEHOLDER);
    expect(result.hits).toBe(1);
  });

  it('has a stable id and exposes the default sensitive name list', () => {
    expect(createHeaderScrubberRule().id).toBe(HEADER_SECRET_MASK_RULE_ID);
    expect(SENSITIVE_HEADER_NAMES).toContain('authorization');
    expect(SENSITIVE_HEADER_NAMES).toContain('cookie');
  });

  it('does not throw on an empty header list', () => {
    expect(createHeaderScrubberRule().apply([])).toEqual({ value: [], hits: 0 });
  });
});

describe('createCookieScrubberRule', () => {
  it('masks all cookie values and marks them masked', () => {
    const result = createCookieScrubberRule().apply([
      cookie({ value: 'a' }),
      cookie({ value: 'b' }),
    ]);
    expect(result.hits).toBe(2);
    expect(result.value.every((c) => c.value === SCRUBBED_VALUE_PLACEHOLDER && c.masked)).toBe(
      true,
    );
  });

  it('skips already-masked cookies', () => {
    const masked = cookie({ value: SCRUBBED_VALUE_PLACEHOLDER, masked: true });
    const result = createCookieScrubberRule().apply([masked]);
    expect(result.value).toEqual([masked]);
    expect(result.hits).toBe(0);
  });

  it('skips empty-value cookies', () => {
    const empty = cookie({ value: '' });
    const result = createCookieScrubberRule().apply([empty]);
    expect(result.hits).toBe(0);
  });

  it('preserves all non-value cookie fields', () => {
    const result = createCookieScrubberRule().apply([cookie({ name: 'sid', domain: 'x.io' })]);
    expect(result.value[0]).toMatchObject({ name: 'sid', domain: 'x.io', httpOnly: true });
  });

  it('has a stable id', () => {
    expect(createCookieScrubberRule().id).toBe(COOKIE_VALUE_MASK_RULE_ID);
  });

  it('does not throw on an empty cookie list', () => {
    expect(createCookieScrubberRule().apply([])).toEqual({ value: [], hits: 0 });
  });
});

describe('scrubHeaders / scrubCookies', () => {
  it('scrubHeaders returns a pipeline result with a schema-valid applied entry', () => {
    const result = scrubHeaders([header('Authorization', 'Bearer x'), header('Accept', '*/*')]);
    expect(result.hits).toBe(1);
    expect(result.applied.map((a) => a.id)).toEqual([HEADER_SECRET_MASK_RULE_ID]);
    for (const entry of result.applied) {
      expect(() => ScrubberRuleAppliedSchema.parse(entry)).not.toThrow();
    }
  });

  it('scrubCookies returns a pipeline result with a schema-valid applied entry', () => {
    const result = scrubCookies([cookie({ value: 'secret' })]);
    expect(result.hits).toBe(1);
    expect(result.value[0]?.masked).toBe(true);
    expect(result.applied.map((a) => a.id)).toEqual([COOKIE_VALUE_MASK_RULE_ID]);
    for (const entry of result.applied) {
      expect(() => ScrubberRuleAppliedSchema.parse(entry)).not.toThrow();
    }
  });
});
