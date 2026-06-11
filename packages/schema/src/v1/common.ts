export type IsoTimestamp = string;
export type SchemaVersion = 'v1';

export interface SizeBytes {
  readonly bytes: number;
}

export interface Permission {
  readonly name: string;
  readonly grantedAtCapture: boolean;
}

export interface ScrubberRuleApplied {
  readonly id: string;
  readonly description: string;
  readonly hits: number;
}
