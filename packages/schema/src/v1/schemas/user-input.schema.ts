import { z } from 'zod';

export const SeveritySchema = z.enum(['minor', 'major', 'critical']);

export const UserInputSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    title: z.string(),
    stepsToReproduce: z.string(),
    severity: SeveritySchema,
    notes: z.string(),
  })
  .strict();
