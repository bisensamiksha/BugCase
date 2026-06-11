import type { IsoTimestamp } from './common';

export type ReproStepType =
  | 'click'
  | 'input'
  | 'change'
  | 'scroll'
  | 'keydown-modifier'
  | 'navigation';

export interface ReproductionStep {
  readonly id: string;
  readonly timestamp: IsoTimestamp;
  readonly type: ReproStepType;
  readonly selector: string;
  readonly description: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface ReproductionRecording {
  readonly schemaVersion: 'v1';
  readonly startedAt: IsoTimestamp;
  readonly endedAt: IsoTimestamp;
  readonly steps: readonly ReproductionStep[];
}
