import { describe, expect, it } from 'vitest';

import type { ConsoleBufferEntry } from '../injected/console-ring-buffer';

import { toConsoleLog } from './console-log';

/** Deterministic id generator for assertions. */
function sequentialIds(): () => string {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

const entry = (overrides: Partial<ConsoleBufferEntry>): ConsoleBufferEntry => ({
  type: 'console',
  level: 'log',
  args: ['hello'],
  timestamp: Date.parse('2026-06-27T12:00:00.000Z'),
  ...overrides,
});

describe('toConsoleLog', () => {
  it('maps console entries to schema ConsoleEntry with ISO timestamps and ids', () => {
    const log = toConsoleLog([entry({ level: 'warn', args: ['hi', 42] })], {
      bufferSize: 500,
      newId: sequentialIds(),
    });

    expect(log.schemaVersion).toBe('v1');
    expect(log.capturedFromRingBuffer).toBe(true);
    expect(log.capturedFromDebugger).toBe(false);
    expect(log.entries).toHaveLength(1);
    const e = log.entries[0];
    expect(e?.id).toBe('id-1');
    expect(e?.level).toBe('warn');
    expect(e?.timestamp).toBe('2026-06-27T12:00:00.000Z');
    expect(e?.args).toEqual([
      { type: 'string', preview: 'hi' },
      { type: 'number', preview: '42' },
    ]);
  });

  it('maps error and unhandledrejection types to the error level', () => {
    const log = toConsoleLog(
      [
        entry({ type: 'error', args: ['boom'] }),
        entry({ type: 'unhandledrejection', args: ['nope'] }),
      ],
      { bufferSize: 500, newId: sequentialIds() },
    );
    expect(log.entries.map((e) => e.level)).toEqual(['error', 'error']);
  });

  it('previews object and array args and carries the full value', () => {
    const log = toConsoleLog([entry({ args: [{ a: 1 }, [1, 2]] })], {
      bufferSize: 500,
      newId: sequentialIds(),
    });
    const [objArg, arrArg] = log.entries[0]?.args ?? [];
    expect(objArg).toEqual({ type: 'object', preview: '{"a":1}', full: { a: 1 } });
    expect(arrArg).toEqual({ type: 'array', preview: '[1,2]', full: [1, 2] });
  });

  it('reports truncated when entries reach the buffer size', () => {
    const full = Array.from({ length: 3 }, () => entry({}));
    const log = toConsoleLog(full, { bufferSize: 3, newId: sequentialIds() });
    expect(log.truncated).toBe(true);
    expect(log.bufferSize).toBe(3);
  });

  it('returns an empty, non-truncated log for no entries', () => {
    const log = toConsoleLog([], { bufferSize: 500 });
    expect(log.entries).toEqual([]);
    expect(log.truncated).toBe(false);
  });

  it('skips malformed entries without throwing', () => {
    const log = toConsoleLog([null, 'nope', 42, entry({ args: ['ok'] })], {
      bufferSize: 500,
      newId: sequentialIds(),
    });
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.args[0]?.preview).toBe('ok');
  });
});
