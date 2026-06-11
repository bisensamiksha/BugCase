import { z } from 'zod';

export const StorageEntrySchema = z
  .object({
    key: z.string(),
    value: z.string(),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();

export const StorageDumpSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    localStorage: z.array(StorageEntrySchema).readonly().nullable(),
    sessionStorage: z.array(StorageEntrySchema).readonly().nullable(),
    note: z.string(),
  })
  .strict();
