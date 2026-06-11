export interface StorageEntry {
  readonly key: string;
  readonly value: string;
  readonly sizeBytes: number;
}

export interface StorageDump {
  readonly schemaVersion: 'v1';
  readonly localStorage: readonly StorageEntry[] | null;
  readonly sessionStorage: readonly StorageEntry[] | null;
  readonly note: string;
}
