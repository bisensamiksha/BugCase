import { z } from 'zod';

import { IsoTimestampSchema } from './common.schema';

export const NavigationEntrySchema = z
  .object({
    url: z.string(),
    title: z.string(),
    visitedAt: IsoTimestampSchema,
  })
  .strict();

export const NavigationLogSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    entries: z.array(NavigationEntrySchema).readonly(),
  })
  .strict();
