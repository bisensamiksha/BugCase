import { z } from 'zod';

export const DomSnapshotSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    contentPath: z.string().min(1),
    byteSize: z.number().int().nonnegative(),
    scrubbed: z.boolean(),
    scrubberHits: z.number().int().nonnegative(),
  })
  .strict();
