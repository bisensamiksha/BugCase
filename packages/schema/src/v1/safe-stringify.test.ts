import { describe, expect, it } from 'vitest';

import { DEFAULT_SAFE_STRINGIFY_OPTIONS, safeStringify } from './safe-stringify';

/** Parse the serialized output back to a value for structural assertions. */
const round = (value: unknown, options?: Parameters<typeof safeStringify>[1]): unknown =>
  JSON.parse(safeStringify(value, options));

describe('safeStringify — output contract', () => {
  it('always returns a string of valid JSON', () => {
    for (const input of [
      undefined,
      null,
      1,
      'x',
      true,
      { a: 1 },
      [1, 2],
      () => 1,
      10n,
      Symbol('s'),
    ]) {
      const out = safeStringify(input);
      expect(typeof out).toBe('string');
      expect(() => {
        JSON.parse(out);
      }).not.toThrow();
    }
  });

  it('round-trips plain JSON-safe data unchanged', () => {
    const input = { a: 1, b: [2, 'x'], c: true, d: null, e: { f: 'g' } };
    expect(round(input)).toEqual(input);
  });

  it('renders top-level primitives and empty states without throwing', () => {
    expect(round(undefined)).toBe('[undefined]');
    expect(safeStringify(null)).toBe('null');
    expect(round('hi')).toBe('hi');
    expect(round(42)).toBe(42);
  });
});

describe('safeStringify — exotic values are made safe (never throws)', () => {
  it('handles functions with their name', () => {
    expect(round({ fn: function foo() {} })).toEqual({ fn: '[Function: foo]' });
    expect(round([function () {}])).toEqual(['[Function: anonymous]']);
  });

  it('handles bigint, symbol, NaN, and Infinity', () => {
    expect(round({ big: 10n, sym: Symbol('s'), nan: NaN, inf: Infinity, ninf: -Infinity })).toEqual(
      {
        big: '[BigInt: 10]',
        sym: '[Symbol(s)]',
        nan: '[Number: NaN]',
        inf: '[Number: Infinity]',
        ninf: '[Number: -Infinity]',
      },
    );
  });

  it('serializes Errors as name + message + stack', () => {
    const result = round(new TypeError('boom')) as Record<string, unknown>;
    expect(result.name).toBe('TypeError');
    expect(result.message).toBe('boom');
    expect(typeof result.stack).toBe('string');
  });

  it('does not throw when a property getter throws — emits a marker instead', () => {
    const trap = {};
    Object.defineProperty(trap, 'bad', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });
    expect(() => safeStringify(trap)).not.toThrow();
    expect(String((round(trap) as Record<string, unknown>).bad)).toContain('[Throw');
  });
});

describe('safeStringify — DOM nodes (duck-typed, works without a real DOM)', () => {
  it('renders an element as a CSS-like selector marker', () => {
    const el = { nodeType: 1, nodeName: 'DIV', id: 'main', className: 'box red' };
    expect(round({ el })).toEqual({ el: '[Element: div#main.box.red]' });
  });

  it('renders an element with no id/class using just the tag', () => {
    const el = { nodeType: 1, nodeName: 'SPAN', id: '', className: '' };
    expect(round(el)).toBe('[Element: span]');
  });

  it('renders non-element nodes by node name', () => {
    expect(round({ nodeType: 3, nodeName: '#text' })).toBe('[Node: #text]');
  });
});

describe('safeStringify — cycle safety', () => {
  it('replaces a self-reference with a [Circular] marker', () => {
    const o: Record<string, unknown> = { a: 1 };
    o.self = o;
    expect(() => safeStringify(o)).not.toThrow();
    expect(round(o)).toEqual({ a: 1, self: '[Circular]' });
  });

  it('does not flag a value shared between siblings as circular', () => {
    const shared = { x: 1 };
    expect(round({ a: shared, b: shared })).toEqual({ a: { x: 1 }, b: { x: 1 } });
  });
});

describe('safeStringify — bounded depth', () => {
  it('collapses objects deeper than maxDepth to an [Object] marker', () => {
    expect(round({ a: { b: { c: 1 } } }, { maxDepth: 1 })).toEqual({ a: '[Object]' });
    expect(round({ a: { b: { c: 1 } } }, { maxDepth: 2 })).toEqual({ a: { b: '[Object]' } });
    expect(round({ a: { b: { c: 1 } } }, { maxDepth: 3 })).toEqual({ a: { b: { c: 1 } } });
  });

  it('collapses arrays deeper than maxDepth to an [Array] marker', () => {
    expect(round([[['deep']]], { maxDepth: 1 })).toEqual(['[Array]']);
  });
});

describe('safeStringify — bounded string length', () => {
  it('truncates long strings and notes how many characters were dropped', () => {
    expect(round('abcdefgh', { maxStringLength: 5 })).toBe('abcde…[+3 chars]');
  });

  it('leaves strings within the limit untouched', () => {
    expect(round('abc', { maxStringLength: 5 })).toBe('abc');
  });
});

describe('DEFAULT_SAFE_STRINGIFY_OPTIONS', () => {
  it('exposes positive depth and length bounds', () => {
    expect(DEFAULT_SAFE_STRINGIFY_OPTIONS.maxDepth).toBeGreaterThan(0);
    expect(DEFAULT_SAFE_STRINGIFY_OPTIONS.maxStringLength).toBeGreaterThan(0);
  });
});
