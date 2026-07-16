import type { ConsoleEntry } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import {
  CONSOLE_LEVELS,
  consoleTimeRange,
  entryText,
  filterConsole,
  levelCounts,
} from './console-filters';

const entry = (over: Partial<ConsoleEntry> = {}): ConsoleEntry => ({
  id: 'e1',
  timestamp: '2026-06-27T12:00:00.000Z',
  level: 'log',
  args: [{ type: 'string', preview: 'hello' }],
  ...over,
});

describe('CONSOLE_LEVELS', () => {
  it('lists the six schema levels in order', () => {
    expect(CONSOLE_LEVELS).toEqual(['log', 'info', 'warn', 'error', 'debug', 'trace']);
  });
});

describe('consoleTimeRange', () => {
  it('returns null for no parseable timestamps', () => {
    expect(consoleTimeRange([])).toBeNull();
    expect(consoleTimeRange([entry({ timestamp: 'not-a-date' })])).toBeNull();
  });
  it('returns the min/max epoch-ms bounds, ignoring unparseable entries', () => {
    const r = consoleTimeRange([
      entry({ id: 'a', timestamp: '2026-06-27T12:00:00.000Z' }),
      entry({ id: 'b', timestamp: 'bad' }),
      entry({ id: 'c', timestamp: '2026-06-27T12:00:02.000Z' }),
    ]);
    expect(r).toEqual({
      minMs: Date.parse('2026-06-27T12:00:00.000Z'),
      maxMs: Date.parse('2026-06-27T12:00:02.000Z'),
    });
  });
});

describe('entryText', () => {
  it('joins level, arg previews and source file', () => {
    const text = entryText(
      entry({
        level: 'error',
        args: [
          { type: 'string', preview: 'boom' },
          { type: 'number', preview: '42' },
        ],
        source: { file: 'app.js', line: 10, column: 2 },
      }),
    );
    expect(text).toContain('error');
    expect(text).toContain('boom');
    expect(text).toContain('42');
    expect(text).toContain('app.js');
  });
});

describe('levelCounts', () => {
  it('counts entries per level with zero for absent levels', () => {
    const counts = levelCounts([
      entry({ id: 'a', level: 'log' }),
      entry({ id: 'b', level: 'error' }),
      entry({ id: 'c', level: 'error' }),
    ]);
    expect(counts.log).toBe(1);
    expect(counts.error).toBe(2);
    expect(counts.warn).toBe(0);
    expect(counts.trace).toBe(0);
  });
});

describe('filterConsole', () => {
  const entries: ConsoleEntry[] = [
    entry({
      id: 'a',
      level: 'log',
      timestamp: '2026-06-27T12:00:00.000Z',
      args: [{ type: 'string', preview: 'alpha' }],
    }),
    entry({
      id: 'b',
      level: 'error',
      timestamp: '2026-06-27T12:00:02.000Z',
      args: [{ type: 'string', preview: 'beta' }],
    }),
  ];

  it('keeps only entries whose level is in the set', () => {
    const out = filterConsole(entries, {
      levels: new Set(['error']),
      matcher: null,
      cutoffMs: null,
    });
    expect(out.map((e) => e.id)).toEqual(['b']);
  });
  it('applies the search matcher to entryText', () => {
    const out = filterConsole(entries, {
      levels: new Set(['log', 'error']),
      matcher: (t) => t.includes('alpha'),
      cutoffMs: null,
    });
    expect(out.map((e) => e.id)).toEqual(['a']);
  });
  it('drops entries after the time cutoff', () => {
    const out = filterConsole(entries, {
      levels: new Set(['log', 'error']),
      matcher: null,
      cutoffMs: Date.parse('2026-06-27T12:00:01.000Z'),
    });
    expect(out.map((e) => e.id)).toEqual(['a']);
  });
  it('keeps an entry with an unparseable timestamp under a cutoff (fail-open)', () => {
    const bad = entry({ id: 'z', level: 'log', timestamp: 'bad' });
    const out = filterConsole([bad], { levels: new Set(['log']), matcher: null, cutoffMs: 0 });
    expect(out.map((e) => e.id)).toEqual(['z']);
  });
});
