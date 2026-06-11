import type { IsoTimestamp } from './common';

export interface NetworkHeader {
  readonly name: string;
  readonly value: string;
}

export interface NetworkBody {
  readonly mimeType: string | null;
  readonly sizeBytes: number;
  readonly base64?: string;
  readonly text?: string;
  readonly truncated: boolean;
}

export type NetworkInitiator = 'fetch' | 'xhr' | 'unknown';

export interface NetworkEntry {
  readonly id: string;
  readonly url: string;
  readonly method: string;
  readonly status: number | null;
  readonly statusText: string | null;
  readonly initiator: NetworkInitiator;
  readonly startedAt: IsoTimestamp;
  readonly endedAt: IsoTimestamp | null;
  readonly durationMs: number | null;
  readonly requestHeaders: readonly NetworkHeader[];
  readonly responseHeaders: readonly NetworkHeader[];
  readonly request: NetworkBody | null;
  readonly response: NetworkBody | null;
  readonly fromCache: boolean;
  readonly failed: boolean;
  readonly errorText: string | null;
}

export interface NetworkLog {
  readonly schemaVersion: 'v1';
  readonly capturedFromRingBuffer: boolean;
  readonly capturedFromDebugger: boolean;
  readonly entries: readonly NetworkEntry[];
}
