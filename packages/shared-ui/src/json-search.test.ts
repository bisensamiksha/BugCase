import { describe, expect, it } from 'vitest';

import { compileSearch, filterJson, primitiveText } from './json-search';

describe('compileSearch', () => {
  it('matches case-insensitive substrings when not using regex', () => {
    const { match, valid } = compileSearch('AUTH', false);
    expect(valid).toBe(true);
    expect(match('Authorization')).toBe(true);
    expect(match('cookie')).toBe(false);
  });

  it('matches a regex when useRegex is on', () => {
    const { match, valid } = compileSearch('^bearer', true);
    expect(valid).toBe(true);
    expect(match('Bearer token')).toBe(true);
    expect(match('a Bearer')).toBe(false);
  });

  it('reports an invalid regex without throwing and matches nothing', () => {
    const { match, valid } = compileSearch('(', true);
    expect(valid).toBe(false);
    expect(match('anything')).toBe(false);
  });
});

describe('primitiveText', () => {
  it('renders null, strings (raw), numbers, and booleans', () => {
    expect(primitiveText(null)).toBe('null');
    expect(primitiveText('hi')).toBe('hi');
    expect(primitiveText(42)).toBe('42');
    expect(primitiveText(true)).toBe('true');
  });
});

describe('filterJson', () => {
  const match = (q: string) => (t: string) => t.toLowerCase().includes(q.toLowerCase());

  it('keeps an object entry whose key matches, with its whole subtree', () => {
    const data = { auth: { token: 'x', nested: { a: 1 } }, other: 1 };
    expect(filterJson(data, match('auth'))).toEqual({ auth: { token: 'x', nested: { a: 1 } } });
  });

  it('keeps a primitive value match and drops siblings', () => {
    const data = { a: 'keepme', b: 'no' };
    expect(filterJson(data, match('keep'))).toEqual({ a: 'keepme' });
  });

  it('keeps ancestors of a nested match', () => {
    const data = { outer: { inner: { token: 'secret' } }, sib: 1 };
    expect(filterJson(data, match('secret'))).toEqual({ outer: { inner: { token: 'secret' } } });
  });

  it('filters array items, keeping only matches', () => {
    expect(filterJson(['alpha', 'beta', 'gamma'], match('a'))).toEqual(['alpha', 'beta', 'gamma']);
    expect(filterJson(['alpha', 'xyz'], match('alph'))).toEqual(['alpha']);
  });

  it('matches a null value via its text form', () => {
    expect(filterJson({ a: null, b: 1 }, match('null'))).toEqual({ a: null });
  });

  it('returns undefined when nothing matches', () => {
    expect(filterJson({ a: 1, b: 2 }, match('zzz'))).toBeUndefined();
  });
});
