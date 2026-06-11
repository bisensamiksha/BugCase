import { z } from 'zod';

export const AnnotationFileSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    screenshotPath: z.string().min(1),
    konvaJson: z.string(),
  })
  .strict();
