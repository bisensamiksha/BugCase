import { z } from 'zod';

export const IsoTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/,
    'Invalid ISO 8601 timestamp',
  );

export const SchemaVersionSchema = z.literal('v1');

export const SizeBytesSchema = z
  .object({
    bytes: z.number().int().nonnegative(),
  })
  .strict();

export const PermissionSchema = z
  .object({
    name: z.string().min(1),
    grantedAtCapture: z.boolean(),
  })
  .strict();

export const ScrubberRuleAppliedSchema = z
  .object({
    id: z.string().min(1),
    description: z.string(),
    hits: z.number().int().nonnegative(),
  })
  .strict();
