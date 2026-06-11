import { z } from 'zod';

import { IsoTimestampSchema } from './common.schema';

export const NetworkHeaderSchema = z
  .object({
    name: z.string(),
    value: z.string(),
  })
  .strict();

export const NetworkBodySchema = z
  .object({
    mimeType: z.string().nullable(),
    sizeBytes: z.number().int().nonnegative(),
    base64: z.string().optional(),
    text: z.string().optional(),
    truncated: z.boolean(),
  })
  .strict();

export const NetworkInitiatorSchema = z.enum(['fetch', 'xhr', 'unknown']);

export const NetworkEntrySchema = z
  .object({
    id: z.string().min(1),
    url: z.string(),
    method: z.string(),
    status: z.number().int().nullable(),
    statusText: z.string().nullable(),
    initiator: NetworkInitiatorSchema,
    startedAt: IsoTimestampSchema,
    endedAt: IsoTimestampSchema.nullable(),
    durationMs: z.number().nonnegative().nullable(),
    requestHeaders: z.array(NetworkHeaderSchema).readonly(),
    responseHeaders: z.array(NetworkHeaderSchema).readonly(),
    request: NetworkBodySchema.nullable(),
    response: NetworkBodySchema.nullable(),
    fromCache: z.boolean(),
    failed: z.boolean(),
    errorText: z.string().nullable(),
  })
  .strict();

export const NetworkLogSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    capturedFromRingBuffer: z.boolean(),
    capturedFromDebugger: z.boolean(),
    entries: z.array(NetworkEntrySchema).readonly(),
  })
  .strict();
