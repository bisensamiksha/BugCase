export interface DomSnapshot {
  readonly schemaVersion: 'v1';
  readonly contentPath: string;
  readonly byteSize: number;
  readonly scrubbed: boolean;
  readonly scrubberHits: number;
}
