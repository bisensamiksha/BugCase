/**
 * Console ring-buffer → schema `ConsoleLog` mapper (S2-25).
 *
 * Turns the raw, JSON-safe entries the S2-06 console ring buffer flushes across the bridge into the
 * report schema's `ConsoleLog`. Pure and defensive: the bridge hands back `unknown[]`, so malformed
 * entries are skipped rather than thrown on. Args are already inert (serialized by `safeStringify`),
 * so previews are derived without touching live page objects.
 */

import type {
  ConsoleArg,
  ConsoleArgType,
  ConsoleEntry,
  ConsoleLevel,
  ConsoleLog,
} from '@bugcase/schema';

import type { ConsoleBufferEntry } from '../injected/console-ring-buffer';

const MAX_PREVIEW = 200;

function defaultNewId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID ? cryptoApi.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function argType(value: unknown): ConsoleArgType {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      // function/symbol/bigint are already stringified upstream by safeStringify.
      return 'string';
  }
}

function clamp(text: string): string {
  return text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW)}…` : text;
}

function previewOf(value: unknown): string {
  if (typeof value === 'string') return clamp(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return clamp(`${value}`);
  }
  // object / array (functions and symbols are already stringified upstream by safeStringify).
  try {
    return clamp(JSON.stringify(value) ?? '[unserializable]');
  } catch {
    return '[unserializable]';
  }
}

function toArg(value: unknown): ConsoleArg {
  const type = argType(value);
  const arg: ConsoleArg = { type, preview: previewOf(value) };
  // Carry the structured value only where the preview can't round-trip it.
  return type === 'object' || type === 'array' ? { ...arg, full: value } : arg;
}

function levelOf(raw: ConsoleBufferEntry): ConsoleLevel {
  if (raw.type === 'error' || raw.type === 'unhandledrejection') {
    return 'error';
  }
  return raw.level ?? 'log';
}

/** Narrow an `unknown` bridge entry to a usable `ConsoleBufferEntry`, or `null` if malformed. */
function coerce(value: unknown): ConsoleBufferEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<ConsoleBufferEntry>;
  if (typeof candidate.timestamp !== 'number' || !Array.isArray(candidate.args)) {
    return null;
  }
  return candidate as ConsoleBufferEntry;
}

function toEntry(raw: ConsoleBufferEntry, newId: () => string): ConsoleEntry {
  return {
    id: newId(),
    timestamp: new Date(raw.timestamp).toISOString(),
    level: levelOf(raw),
    args: raw.args.map(toArg),
  };
}

export interface ToConsoleLogOptions {
  /** The ring buffer's max size — used for the `bufferSize` / `truncated` fields. */
  readonly bufferSize: number;
  /** Id generator (injectable for tests); defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
}

/** Map raw bridge `console` entries to a schema `ConsoleLog` (ring-buffer source). */
export function toConsoleLog(
  entries: readonly unknown[],
  options: ToConsoleLogOptions,
): ConsoleLog {
  const newId = options.newId ?? defaultNewId;
  const mapped = entries.flatMap((value) => {
    const raw = coerce(value);
    return raw ? [toEntry(raw, newId)] : [];
  });
  return {
    schemaVersion: 'v1',
    capturedFromRingBuffer: true,
    capturedFromDebugger: false,
    bufferSize: options.bufferSize,
    truncated: mapped.length >= options.bufferSize,
    entries: mapped,
  };
}
