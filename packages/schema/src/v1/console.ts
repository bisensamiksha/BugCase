import type { IsoTimestamp } from './common';

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace';

export type ConsoleArgType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'undefined'
  | 'object'
  | 'array'
  | 'error'
  | 'function'
  | 'dom';

export interface ConsoleArg {
  readonly type: ConsoleArgType;
  readonly preview: string;
  readonly full?: unknown;
}

export interface ConsoleSource {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface ConsoleEntry {
  readonly id: string;
  readonly timestamp: IsoTimestamp;
  readonly level: ConsoleLevel;
  readonly args: readonly ConsoleArg[];
  readonly stack?: string;
  readonly source?: ConsoleSource;
}

export interface ConsoleLog {
  readonly schemaVersion: 'v1';
  readonly capturedFromRingBuffer: boolean;
  readonly capturedFromDebugger: boolean;
  readonly bufferSize: number;
  readonly truncated: boolean;
  readonly entries: readonly ConsoleEntry[];
}
