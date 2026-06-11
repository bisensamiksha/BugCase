import type { IsoTimestamp } from './common';

export interface NavigationEntry {
  readonly url: string;
  readonly title: string;
  readonly visitedAt: IsoTimestamp;
}

export interface NavigationLog {
  readonly schemaVersion: 'v1';
  readonly entries: readonly NavigationEntry[];
}
