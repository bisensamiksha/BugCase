export type Severity = 'minor' | 'major' | 'critical';

export interface UserInput {
  readonly schemaVersion: 'v1';
  readonly title: string;
  readonly stepsToReproduce: string;
  readonly severity: Severity;
  readonly notes: string;
}
