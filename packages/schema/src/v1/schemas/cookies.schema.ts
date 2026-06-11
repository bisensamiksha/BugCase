import { z } from 'zod';

export const CookieSameSiteSchema = z.enum(['strict', 'lax', 'none', 'unspecified']);

export const CookieEntrySchema = z
  .object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string(),
    expiresAt: z.string().nullable(),
    httpOnly: z.boolean(),
    secure: z.boolean(),
    sameSite: CookieSameSiteSchema,
    session: z.boolean(),
    masked: z.boolean(),
  })
  .strict();

export const CookiesDumpSchema = z
  .object({
    schemaVersion: z.literal('v1'),
    entries: z.array(CookieEntrySchema).readonly(),
  })
  .strict();
