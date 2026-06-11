import { z } from 'zod';

import { IsoTimestampSchema } from './common.schema';

export const ConsoleLevelSchema = z.enum(['log', 'info', 'warn', 'error', 'debug', 'trace']);

export const ConsoleArgTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'null',
  'undefined',
  'object',
  'array',
  'error',
  'function',
  'dom',
]);

export const ConsoleArgSchema = z
  .object({
    type: ConsoleArgTypeSchema,
    preview: z.string(),
    full: z.unknown().optional(),
  })
  .strict();

export const ConsoleSourceSchema = z
  .object({
    file: z.string(),
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  })
  .strict();

export const ConsoleEntrySchema = z
  .object({
    id: z.string().min(1),
    timestamp: IsoTimestampSchema,
    level: ConsoleLevelSchema,
    args: z.array(ConsoleArgSchema).readonly(),
    stack: z.string().optional(),
    source: ConsoleSourceSchema.optional(),
  })
  .strict();

export const ConsoleLogSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    capturedFromRingBuffer: z.boolean(),
    capturedFromDebugger: z.boolean(),
    bufferSize: z.number().int().positive(),
    truncated: z.boolean(),
    entries: z.array(ConsoleEntrySchema).readonly(),
  })
  .strict();
