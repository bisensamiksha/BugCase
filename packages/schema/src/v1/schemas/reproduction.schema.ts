import { z } from 'zod';

import { IsoTimestampSchema } from './common.schema';

export const ReproStepTypeSchema = z.enum([
  'click',
  'input',
  'change',
  'scroll',
  'keydown-modifier',
  'navigation',
]);

export const ReproductionStepSchema = z
  .object({
    id: z.string().min(1),
    timestamp: IsoTimestampSchema,
    type: ReproStepTypeSchema,
    selector: z.string(),
    description: z.string(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  })
  .strict();

export const ReproductionRecordingSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    startedAt: IsoTimestampSchema,
    endedAt: IsoTimestampSchema,
    steps: z.array(ReproductionStepSchema).readonly(),
  })
  .strict();
