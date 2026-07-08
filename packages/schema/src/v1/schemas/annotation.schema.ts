import { z } from 'zod';

export const AnnotationFileSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    screenshotPath: z.string().min(1),
    konvaJson: z.string(),
  })
  .strict();

export const AnnotationsManifestSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    annotations: z.array(AnnotationFileSchema).readonly(),
  })
  .strict();
