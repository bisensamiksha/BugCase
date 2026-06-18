import { describe, expect, it } from 'vitest';

import { normalizeHeaders, parseHeaderString } from './network-entry';

describe('normalizeHeaders', () => {
  it('reads a Headers-like object via forEach((value, name))', () => {
    const headers = {
      forEach(cb: (value: string, name: string) => void) {
        cb('application/json', 'content-type');
        cb('1', 'x-test');
      },
    };
    expect(normalizeHeaders(headers)).toEqual([
      { name: 'content-type', value: 'application/json' },
      { name: 'x-test', value: '1' },
    ]);
  });

  it('reads an array of [name, value] pairs', () => {
    expect(
      normalizeHeaders([
        ['accept', 'text/html'],
        ['x-id', '42'],
      ]),
    ).toEqual([
      { name: 'accept', value: 'text/html' },
      { name: 'x-id', value: '42' },
    ]);
  });

  it('reads a plain record, coercing values to strings', () => {
    expect(normalizeHeaders({ 'x-num': 7, accept: 'text/html' })).toEqual([
      { name: 'x-num', value: '7' },
      { name: 'accept', value: 'text/html' },
    ]);
  });

  it('returns an empty array for null/undefined/non-objects', () => {
    expect(normalizeHeaders(undefined)).toEqual([]);
    expect(normalizeHeaders(null)).toEqual([]);
    expect(normalizeHeaders('nope')).toEqual([]);
  });
});

describe('parseHeaderString', () => {
  it('parses a CRLF-separated getAllResponseHeaders() string', () => {
    const raw = 'content-type: text/plain\r\nx-foo: bar\r\n';
    expect(parseHeaderString(raw)).toEqual([
      { name: 'content-type', value: 'text/plain' },
      { name: 'x-foo', value: 'bar' },
    ]);
  });

  it('keeps colons inside the value (e.g. URLs, timestamps)', () => {
    expect(parseHeaderString('location: https://x.test/a:b\r\n')).toEqual([
      { name: 'location', value: 'https://x.test/a:b' },
    ]);
  });

  it('returns an empty array for an empty or whitespace string', () => {
    expect(parseHeaderString('')).toEqual([]);
    expect(parseHeaderString('  \r\n ')).toEqual([]);
  });
});
