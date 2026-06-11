import { z } from 'zod';

export const BoundingClientRectSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();

export const ElementAncestorSchema = z
  .object({
    tag: z.string(),
    id: z.string().nullable(),
    classes: z.array(z.string()).readonly(),
  })
  .strict();

export const ElementInspectionSchema = z
  .object({
    id: z.string().min(1),
    outerHtml: z.string(),
    computedStyles: z.record(z.string(), z.string()),
    boundingClientRect: BoundingClientRectSchema,
    ancestors: z.array(ElementAncestorSchema).readonly(),
    screenshotCropPath: z.string(),
  })
  .strict();

export const ElementInspectionsManifestSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    inspections: z.array(ElementInspectionSchema).readonly(),
  })
  .strict();
