import { z } from 'zod';

export const ScreenshotCaptureMethodSchema = z.enum(['visibleTab', 'cdpFullPage', 'scrollStitch']);

export const ScreenshotRefSchema = z
  .object({
    path: z.string().min(1),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    devicePixelRatio: z.number().positive(),
    captureMethod: ScreenshotCaptureMethodSchema,
    hasAnnotations: z.boolean(),
    annotationsPath: z.string().optional(),
  })
  .strict();

export const ScreenshotsManifestSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    viewport: ScreenshotRefSchema.optional(),
    fullPage: ScreenshotRefSchema.optional(),
    elementCrops: z.array(ScreenshotRefSchema).readonly(),
  })
  .strict();
